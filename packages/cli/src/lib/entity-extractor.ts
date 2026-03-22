import {
  KnowledgeRepository,
  GraphRepository,
  EntityExtractor,
  RelationInferrer,
  PatternExtractor,
} from "@knowledgine/core";
import type { EntityType, ExtractedPattern } from "@knowledgine/core";

export interface PostIngestSummary {
  totalNotes: number;
  processedNotes: number;
  totalEntities: number;
  totalRelations: number;
  totalPatterns: number;
  errors: number;
}

/**
 * Deduplicate patterns by (type, lineNumber, content) key.
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
 * 全ノートに対してパターン抽出、エンティティ抽出、関係推論をバッチ実行する。
 * init コマンドから ingest パイプライン経由でノートが保存された後に呼ばれる。
 */
export async function postIngestProcessing(
  repository: KnowledgeRepository,
  graphRepository: GraphRepository,
  onProgress?: (current: number, total: number) => void,
): Promise<PostIngestSummary> {
  const notes = repository.getAllNotes();
  const patternExtractor = new PatternExtractor();
  const entityExtractor = new EntityExtractor();
  const inferrer = new RelationInferrer();

  let processedNotes = 0;
  let totalEntities = 0;
  let totalRelations = 0;
  let totalPatterns = 0;
  let errors = 0;

  for (const note of notes) {
    try {
      const frontmatter = note.frontmatter_json ? JSON.parse(note.frontmatter_json) : {};
      const now = new Date().toISOString();

      // Pattern extraction
      const dailyPatterns = patternExtractor.extractDailyPatterns(note.content);
      const ticketPatterns = patternExtractor.extractTicketPatterns(note.content);
      const allPatterns = deduplicatePatterns([...dailyPatterns, ...ticketPatterns]);
      repository.savePatterns(note.id, allPatterns);
      totalPatterns += allPatterns.length;

      // Entity extraction
      const extractedEntities = entityExtractor.extract(note.content, frontmatter);

      const entityList: Array<{ name: string; entityType: EntityType }> = [];
      for (const entity of extractedEntities) {
        const entityId = graphRepository.upsertEntity({
          name: entity.name,
          entityType: entity.entityType,
          createdAt: now,
        });
        graphRepository.linkEntityToNote(entityId, note.id);
        entityList.push({ name: entity.name, entityType: entity.entityType });
      }
      totalEntities += extractedEntities.length;

      // Relation inference
      const inferredRelations = inferrer.infer(entityList, frontmatter);
      for (const rel of inferredRelations) {
        const fromEntity = graphRepository.getEntityByName(rel.fromName, rel.fromType);
        const toEntity = graphRepository.getEntityByName(rel.toName, rel.toType);
        if (fromEntity?.id && toEntity?.id) {
          graphRepository.upsertRelation({
            fromEntityId: fromEntity.id,
            toEntityId: toEntity.id,
            relationType: rel.relationType,
            strength: rel.strength,
            createdAt: now,
          });
          totalRelations++;
        }
      }

      processedNotes++;
      onProgress?.(processedNotes, notes.length);
    } catch {
      errors++;
    }
  }

  return {
    totalNotes: notes.length,
    processedNotes,
    totalEntities,
    totalRelations,
    totalPatterns,
    errors,
  };
}
