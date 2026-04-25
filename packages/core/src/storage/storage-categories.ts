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
 * Owning table → category map used to attribute SQLite index pages to
 * the same bucket as their owning table. Order is a longest-prefix-match
 * preference (the search picks the longest matching prefix), so the
 * specific entries (`note_embeddings`, `knowledge_notes_fts`) come
 * before the generic ones (`knowledge_notes`).
 */
const KNOWN_TABLE_OWNERS: ReadonlyArray<readonly [string, StorageCategory]> = [
  ["memory_entries", "memory"],
  ["note_embeddings", "embeddings"],
  ["knowledge_notes_fts", "fts"],
  ["knowledge_notes", "notes"],
  ["entity_note_links", "graph"],
  ["entities_fts", "graph"],
  ["entities", "graph"],
  ["relations", "graph"],
  ["observations", "graph"],
  ["events", "events"],
  ["ingest_cursors", "events"],
  ["provenance", "events"],
  ["file_timeline", "events"],
  ["extraction_feedback", "events"],
  ["extracted_patterns", "notes"],
  ["problem_solution_pairs", "notes"],
  ["note_links", "notes"],
] as const;

/**
 * If `name` looks like an index name, return the owning table's category.
 * Recognises both custom indexes (`idx_<table>_<column>`) and SQLite's
 * own auto-indexes (`sqlite_autoindex_<table>_<n>`). Returns undefined
 * when the name doesn't look like an index or no owning table can be
 * matched (in which case `classifyTable` falls back to its normal rules).
 */
function indexOwnerCategory(name: string): StorageCategory | undefined {
  let stripped: string;
  if (name.startsWith("idx_")) {
    stripped = name.slice("idx_".length);
  } else if (name.startsWith("sqlite_autoindex_")) {
    stripped = name.slice("sqlite_autoindex_".length).replace(/_\d+$/, "");
  } else {
    return undefined;
  }
  let best: readonly [string, StorageCategory] | undefined;
  for (const candidate of KNOWN_TABLE_OWNERS) {
    const [t] = candidate;
    if (stripped === t || stripped.startsWith(t + "_")) {
      if (!best || t.length > best[0].length) best = candidate;
    }
  }
  return best?.[1];
}

/**
 * Map a SQLite table (or virtual-table shadow, or index) name to a
 * storage category.
 *
 * Order matters: index handling and prefix rules are checked before
 * falling back to the exact-match table. The `memory_` prefix wins over
 * the generic `*_fts` suffix so that `memory_entries_fts` lands in
 * `memory`, not `fts`. Index entries (`idx_*`, `sqlite_autoindex_*_<n>`)
 * are routed to the same bucket as their owning table — without this,
 * indexes (which often dominate table storage) would all land in
 * `other` and make the breakdown misleading.
 */
export function classifyTable(name: string): StorageCategory {
  const indexCategory = indexOwnerCategory(name);
  if (indexCategory) return indexCategory;

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
