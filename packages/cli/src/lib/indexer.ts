import { readdir } from "fs/promises";
import { join, extname } from "path";
import { FileProcessor, PatternExtractor, KnowledgeRepository } from "@knowledgine/core";
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

export async function indexFile(
  relativePath: string,
  rootPath: string,
  fileProcessor: FileProcessor,
  patternExtractor: PatternExtractor,
  repository: KnowledgeRepository,
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
  return noteId;
}

export async function indexAll(
  rootPath: string,
  repository: KnowledgeRepository,
): Promise<IndexSummary> {
  const start = Date.now();
  const fileProcessor = new FileProcessor();
  const patternExtractor = new PatternExtractor();
  const errors: string[] = [];

  const files = await discoverMarkdownFiles(rootPath);
  let processedFiles = 0;

  for (const file of files) {
    try {
      await indexFile(file, rootPath, fileProcessor, patternExtractor, repository);
      processedFiles++;
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
