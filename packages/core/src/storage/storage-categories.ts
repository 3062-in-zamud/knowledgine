export type StorageCategory =
  | "notes"
  | "fts"
  | "embeddings"
  | "graph"
  | "events"
  | "memory"
  | "other";

export const STORAGE_CATEGORIES: ReadonlyArray<StorageCategory> = [
  "notes",
  "fts",
  "embeddings",
  "graph",
  "events",
  "memory",
  "other",
] as const;

const EXACT_MATCH: Readonly<Record<string, StorageCategory>> = {
  knowledge_notes: "notes",
  extracted_patterns: "notes",
  problem_solution_pairs: "notes",
  note_links: "notes",

  note_embeddings: "embeddings",

  entities: "graph",
  relations: "graph",
  observations: "graph",
  entity_note_links: "graph",

  events: "events",
  ingest_cursors: "events",
  provenance: "events",
  file_timeline: "events",
  extraction_feedback: "events",

  memory_entries: "memory",

  sqlite_schema: "other",
  sqlite_sequence: "other",
  sqlite_temp_master: "other",
  sqlite_master: "other",
  schema_migrations: "other",
};

/**
 * Map a SQLite table (or virtual-table shadow) name to a storage category.
 *
 * Order matters: prefix rules are checked before falling back to the
 * exact-match table. The `memory_` prefix wins over the generic `*_fts`
 * suffix so that `memory_entries_fts` lands in `memory`, not `fts`.
 */
export function classifyTable(name: string): StorageCategory {
  // Prefix-first rules (must be evaluated before suffix-based heuristics).
  if (name.startsWith("memory_")) return "memory";
  if (name.startsWith("note_embeddings")) return "embeddings";
  if (name.startsWith("knowledge_notes_fts")) return "fts";
  if (name.startsWith("entities_fts")) return "graph";
  if (name.startsWith("extraction_feedback")) return "events";
  if (name.startsWith("provenance")) return "events";
  if (name.startsWith("file_timeline")) return "events";

  const exact = EXACT_MATCH[name];
  if (exact !== undefined) return exact;

  return "other";
}
