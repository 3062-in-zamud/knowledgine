import type {
  SearchKnowledgeResult,
  FindRelatedResult,
  StatsResult,
  SearchEntitiesResult,
} from "@knowledgine/core";
import { createTable, colors, scoreColor } from "./ui/index.js";

export type OutputFormat = "json" | "table" | "plain";

export function formatSearchResults(
  results: SearchKnowledgeResult["results"],
  format: OutputFormat,
): string {
  if (format === "json") {
    return JSON.stringify(results, null, 2);
  }
  if (format === "plain") {
    return results.map((r) => `[${r.score.toFixed(2)}] ${r.filePath}  ${r.title}`).join("\n");
  }
  // table
  if (results.length === 0) return "";
  const rows = results.map((r) => [
    scoreColor(r.score)(r.score.toFixed(2)),
    r.title,
    colors.dim(r.filePath),
  ]);
  return createTable({ head: ["Score", "Title", "File"], rows });
}

export function formatRelatedNotes(result: FindRelatedResult, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }
  if (format === "plain") {
    const lines: string[] = [`Note ID: ${result.noteId}`];
    for (const n of result.relatedNotes) {
      lines.push(`  [${n.score.toFixed(2)}] ${n.filePath}  ${n.title}`);
    }
    return lines.join("\n");
  }
  // table
  const header = `Related notes for noteId=${result.noteId}:`;
  if (result.relatedNotes.length === 0) {
    return `${header}\n  (no related notes found)`;
  }
  const rows = result.relatedNotes.map((n) => [
    scoreColor(n.score)(n.score.toFixed(2)),
    n.title,
    colors.dim(n.filePath),
  ]);
  return `${header}\n${createTable({ head: ["Score", "Title", "File"], rows })}`;
}

export function formatStats(stats: StatsResult, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(stats, null, 2);
  }
  if (format === "plain") {
    return [
      `Notes: ${stats.totalNotes}`,
      `Patterns: ${stats.totalPatterns}`,
      `Links: ${stats.totalLinks}`,
      `Pairs: ${stats.totalPairs}`,
      `Embeddings: ${stats.embeddingStatus.available ? "enabled" : "disabled"}`,
    ].join("\n");
  }
  // table
  const rows: string[][] = [
    ["Total Notes", colors.info(String(stats.totalNotes))],
    ["Total Patterns", colors.info(String(stats.totalPatterns))],
    ["Total Links", colors.info(String(stats.totalLinks))],
    ["Total Pairs", colors.info(String(stats.totalPairs))],
    ["Embeddings Available", colors.info(String(stats.embeddingStatus.available))],
  ];
  if (stats.embeddingStatus.notesWithoutEmbeddings !== null) {
    rows.push([
      "Notes Without Embeddings",
      colors.info(String(stats.embeddingStatus.notesWithoutEmbeddings)),
    ]);
  }
  if (stats.graphStats) {
    rows.push(["Graph Entities", colors.info(String(stats.graphStats.totalEntities))]);
    rows.push(["Graph Relations", colors.info(String(stats.graphStats.totalRelations))]);
  }
  return createTable({ head: ["Metric", "Value"], rows });
}

export function formatEntities(result: SearchEntitiesResult, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }
  if (format === "plain") {
    return result.entities
      .map((e) => `[${e.entityType}] ${e.name}${e.description ? "  " + e.description : ""}`)
      .join("\n");
  }
  // table
  if (result.entities.length === 0) return "";
  const rows = result.entities.map((e) => [String(e.id), colors.accent(e.entityType), e.name]);
  return createTable({ head: ["ID", "Type", "Name"], rows });
}
