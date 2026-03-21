import type {
  SearchKnowledgeResult,
  FindRelatedResult,
  StatsResult,
  SearchEntitiesResult,
} from "@knowledgine/core";

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
  const header = `${"Score".padEnd(7)}${"Title".padEnd(40)}FilePath`;
  const sep = "-".repeat(header.length);
  const rows = results.map(
    (r) =>
      `${r.score.toFixed(2).padEnd(7)}${r.title.slice(0, 38).padEnd(40)}${r.filePath}`,
  );
  return [header, sep, ...rows].join("\n");
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
  const lines: string[] = [`Related notes for noteId=${result.noteId}:`];
  if (result.relatedNotes.length > 0) {
    const header = `  ${"Score".padEnd(7)}${"Title".padEnd(40)}FilePath`;
    lines.push(header);
    lines.push("  " + "-".repeat(header.length - 2));
    for (const n of result.relatedNotes) {
      lines.push(`  ${n.score.toFixed(2).padEnd(7)}${n.title.slice(0, 38).padEnd(40)}${n.filePath}`);
    }
  } else {
    lines.push("  (no related notes found)");
  }
  return lines.join("\n");
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
  const lines: string[] = [
    `${"Metric".padEnd(30)}Value`,
    "-".repeat(50),
    `${"Total Notes".padEnd(30)}${stats.totalNotes}`,
    `${"Total Patterns".padEnd(30)}${stats.totalPatterns}`,
    `${"Total Links".padEnd(30)}${stats.totalLinks}`,
    `${"Total Pairs".padEnd(30)}${stats.totalPairs}`,
    `${"Embeddings Available".padEnd(30)}${stats.embeddingStatus.available}`,
  ];
  if (stats.embeddingStatus.notesWithoutEmbeddings !== null) {
    lines.push(`${"Notes Without Embeddings".padEnd(30)}${stats.embeddingStatus.notesWithoutEmbeddings}`);
  }
  if (stats.graphStats) {
    lines.push(`${"Graph Entities".padEnd(30)}${stats.graphStats.totalEntities}`);
    lines.push(`${"Graph Relations".padEnd(30)}${stats.graphStats.totalRelations}`);
  }
  return lines.join("\n");
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
  const header = `${"ID".padEnd(6)}${"Type".padEnd(15)}${"Name".padEnd(30)}Description`;
  const sep = "-".repeat(header.length);
  const rows = result.entities.map(
    (e) =>
      `${String(e.id).padEnd(6)}${e.entityType.padEnd(15)}${e.name.slice(0, 28).padEnd(30)}${e.description ?? ""}`,
  );
  return [header, sep, ...rows].join("\n");
}
