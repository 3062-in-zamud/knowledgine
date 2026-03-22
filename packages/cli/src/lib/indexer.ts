import { readdir } from "fs/promises";
import { join, extname } from "path";
import {
  FileProcessor,
  PatternExtractor,
  KnowledgeRepository,
  EntityExtractor,
  RelationInferrer,
  GraphRepository,
} from "@knowledgine/core";
import type { ExtractedPattern } from "@knowledgine/core";

export interface IndexSummary {
  totalFiles: number;
  processedFiles: number;
  totalPatterns: number;
  elapsedMs: number;
  errors: string[];
}

export async function discoverMarkdownFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { recursive: true });
  return entries
    .filter((entry): entry is string => typeof entry === "string")
    .filter((entry) => {
      if (extname(entry) !== ".md") return false;
      const parts = entry.split("/");
      // Exclude node_modules and dot-prefixed directories
      return !parts.some((part) => part === "node_modules" || part.startsWith("."));
    });
}

export function deduplicatePatterns(patterns: ExtractedPattern[]): ExtractedPattern[] {
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

export interface IndexFileResult {
  noteId: number;
  patternCount: number;
}

/** @deprecated Use IngestEngine with MarkdownPlugin instead */
export async function indexFile(
  relativePath: string,
  rootPath: string,
  fileProcessor: FileProcessor,
  patternExtractor: PatternExtractor,
  repository: KnowledgeRepository,
  graphRepository?: GraphRepository,
): Promise<number> {
  const absolutePath = join(rootPath, relativePath);
  const processed = await fileProcessor.processFile(absolutePath);
  const title = fileProcessor.extractTitle(processed.content, relativePath);

  const noteId = repository.saveNote({
    filePath: relativePath,
    title,
    content: processed.content,
    frontmatter: processed.frontmatter,
    createdAt: new Date().toISOString(),
  });

  const dailyPatterns = patternExtractor.extractDailyPatterns(processed.content);
  const ticketPatterns = patternExtractor.extractTicketPatterns(processed.content);
  const allPatterns = deduplicatePatterns([...dailyPatterns, ...ticketPatterns]);

  repository.savePatterns(noteId, allPatterns);

  // エンティティ抽出・関係推論（graphRepositoryが提供された場合）
  if (graphRepository) {
    try {
      const extractor = new EntityExtractor();
      const inferrer = new RelationInferrer();
      const extractedEntities = extractor.extract(processed.content, processed.frontmatter);
      const now = new Date().toISOString();

      // エンティティを登録してnoteにリンク
      const entityList: Array<{
        name: string;
        entityType: import("@knowledgine/core").EntityType;
      }> = [];
      for (const entity of extractedEntities) {
        const entityId = graphRepository.upsertEntity({
          name: entity.name,
          entityType: entity.entityType,
          createdAt: now,
        });
        graphRepository.linkEntityToNote(entityId, noteId);
        entityList.push({ name: entity.name, entityType: entity.entityType });
      }

      // 関係推論と登録
      const inferredRelations = inferrer.infer(entityList, processed.frontmatter);
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
        }
      }
    } catch {
      // エンティティ抽出の失敗はファイルインデックスをブロックしない
    }
  }

  return noteId;
}

export interface IndexAllOptions {
  onProgress?: (current: number, total: number, filePath: string) => void;
}

/** @deprecated Use IngestEngine with MarkdownPlugin instead */
export async function indexAll(
  rootPath: string,
  repository: KnowledgeRepository,
  graphRepository?: GraphRepository,
  options?: IndexAllOptions,
): Promise<IndexSummary> {
  const start = Date.now();
  const fileProcessor = new FileProcessor();
  const patternExtractor = new PatternExtractor();
  const errors: string[] = [];

  const files = await discoverMarkdownFiles(rootPath);
  let processedFiles = 0;

  for (const file of files) {
    try {
      await indexFile(file, rootPath, fileProcessor, patternExtractor, repository, graphRepository);
      processedFiles++;
      options?.onProgress?.(processedFiles, files.length, file);
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const totalPatterns = repository.getStats().totalPatterns;

  return {
    totalFiles: files.length,
    processedFiles,
    totalPatterns,
    elapsedMs: Date.now() - start,
    errors,
  };
}
