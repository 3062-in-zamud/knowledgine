import type { KnowledgeRepository } from "../storage/knowledge-repository.js";
import type { GraphRepository } from "../graph/graph-repository.js";
import { PatternExtractor } from "./pattern-extractor.js";
import { EntityExtractor } from "../graph/entity-extractor.js";
import { RelationInferrer } from "../graph/relation-inferrer.js";
import type { ExtractedPattern } from "../types.js";
import type { EntityType } from "../types.js";

export interface ExtractionSummary {
  processedNotes: number;
  totalEntities: number;
  totalRelations: number;
  totalPatterns: number;
  errors: number;
}

const CHUNK_SIZE = 999; // SQLite IN句の変数制限対策

/**
 * パターンを (type, lineNumber, content) キーで重複排除する
 */
function deduplicatePatterns(patterns: ExtractedPattern[]): ExtractedPattern[] {
  const seen = new Set<string>();
  const result: ExtractedPattern[] = [];
  for (const p of patterns) {
    const key = JSON.stringify([p.type, p.lineNumber ?? null, p.content]);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

/**
 * 指定した noteIds に対してパターン抽出・エンティティ抽出・関係推論を実行する。
 * 各 ingest ソース (GitHub, git-history, capture, MCP 等) 完了後に呼び出すことで
 * 増分的な抽出を実現する。
 */
export class IncrementalExtractor {
  constructor(
    private repository: KnowledgeRepository,
    private graphRepository: GraphRepository,
  ) {}

  async process(
    noteIds: number[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<ExtractionSummary> {
    // 1. 重複排除
    const uniqueIds = [...new Set(noteIds)];
    const total = uniqueIds.length;

    if (total === 0) {
      return {
        processedNotes: 0,
        totalEntities: 0,
        totalRelations: 0,
        totalPatterns: 0,
        errors: 0,
      };
    }

    const patternExtractor = new PatternExtractor();
    const entityExtractor = new EntityExtractor();
    const inferrer = new RelationInferrer();

    let processedNotes = 0;
    let totalEntities = 0;
    let totalRelations = 0;
    let totalPatterns = 0;
    let errors = 0;

    // 2. チャンク分割（SQLite IN句の変数制限対策）
    for (let chunkStart = 0; chunkStart < total; chunkStart += CHUNK_SIZE) {
      const chunk = uniqueIds.slice(chunkStart, chunkStart + CHUNK_SIZE);

      for (const noteId of chunk) {
        try {
          const note = this.repository.getNoteById(noteId);
          if (!note) {
            errors++;
            continue;
          }

          const frontmatter = note.frontmatter_json ? JSON.parse(note.frontmatter_json) : {};
          const now = new Date().toISOString();

          // パターン抽出
          const dailyPatterns = patternExtractor.extractDailyPatterns(note.content);
          const ticketPatterns = patternExtractor.extractTicketPatterns(note.content);
          const allPatterns = deduplicatePatterns([...dailyPatterns, ...ticketPatterns]);
          this.repository.savePatterns(note.id, allPatterns);
          totalPatterns += allPatterns.length;

          // エンティティ抽出
          const extractedEntities = entityExtractor.extract(note.content, frontmatter);
          const entityList: Array<{ name: string; entityType: EntityType }> = [];
          for (const entity of extractedEntities) {
            const entityId = this.graphRepository.upsertEntity({
              name: entity.name,
              entityType: entity.entityType,
              createdAt: now,
            });
            this.graphRepository.linkEntityToNote(entityId, note.id);
            entityList.push({ name: entity.name, entityType: entity.entityType });
          }
          totalEntities += extractedEntities.length;

          // 関係推論
          const inferredRelations = inferrer.infer(entityList, frontmatter);
          for (const rel of inferredRelations) {
            const fromEntity = this.graphRepository.getEntityByName(rel.fromName, rel.fromType);
            const toEntity = this.graphRepository.getEntityByName(rel.toName, rel.toType);
            if (fromEntity?.id && toEntity?.id) {
              this.graphRepository.upsertRelation({
                fromEntityId: fromEntity.id,
                toEntityId: toEntity.id,
                relationType: rel.relationType,
                strength: rel.strength,
                createdAt: now,
              });
              totalRelations++;
            }
          }

          // extracted_at を更新
          this.repository.updateExtractedAt(note.id);

          processedNotes++;
          onProgress?.(processedNotes, total);
        } catch {
          errors++;
        }
      }
    }

    return { processedNotes, totalEntities, totalRelations, totalPatterns, errors };
  }
}
