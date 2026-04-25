# Design: DB Storage Optimization

## Ticket ID

KNOW-404

## Architecture Overview

```
┌──────────────────── packages/cli ────────────────────┐
│ status.ts                                            │
│   └─ formats StorageBreakdown into Database section  │
└────────────────────┬─────────────────────────────────┘
                     │ KnowledgeRepository.getStorageBreakdown()
┌────────────────────▼─── packages/core/src/storage ───┐
│ knowledge-repository.ts                              │
│   ├─ getStorageBreakdown()  (NEW)                    │
│   │    └─ uses dbstat vtab → bucket by table name    │
│   ├─ saveEmbedding / saveEmbeddingBatch  (UPDATED)   │
│   ├─ searchByVector  (UPDATED)                       │
│   └─ ensureVectorIndexTable  (UPDATED — 🔴 critical) │
│ database.ts                                          │
│   └─ createDatabase: + synchronous, cache_size,      │
│      page_size (new DB only)                         │
│ quantization.ts  (NEW)                               │
│   ├─ quantizeFloat32ToInt8                           │
│   └─ dequantizeInt8                                  │
│ storage-categories.ts  (NEW)                         │
│   └─ Record<table_name, Category> mapping            │
│ migrations/021_embedding_int8_quantization.ts (NEW)  │
│   ├─ ALTER note_embeddings ADD embedding_scale       │
│   ├─ chunked re-quantize of float32 rows             │
│   ├─ DROP/CREATE note_embeddings_vec as INT8[384]    │
│   └─ guarded auto_vacuum + VACUUM (skip > 50 MB)     │
└──────────────────────────────────────────────────────┘
```

## Interface Definitions

```typescript
// packages/core/src/storage/quantization.ts (NEW)

/**
 * Uniform-scale int8 quantization for L2-normalized vectors.
 * q[i] = clamp(round(v[i] * 127), -128, 127).
 *
 * This works because every component of an L2-normalized 384-dim vector
 * lies in [-1, 1], so the int8 representation captures full dynamic range
 * with a single fixed scale (1/127) shared across all vectors. Sharing
 * the scale is REQUIRED for sqlite-vec's INT8[N] virtual table — it
 * does not store per-row scales.
 */
export function quantizeFloat32ToInt8(vec: Float32Array): Int8Array;

/** Inverse for reranking / sanity tests: v[i] ≈ q[i] / 127. */
export function dequantizeInt8(bytes: Int8Array): Float32Array;

// packages/core/src/storage/storage-categories.ts (NEW)
export type StorageCategory =
  | 'notes' | 'fts' | 'embeddings' | 'graph'
  | 'events' | 'memory' | 'other';

export const TABLE_TO_CATEGORY: Record<string, StorageCategory>; // explicit mapping
export function classifyTable(tableName: string): StorageCategory; // prefix-aware

// packages/core/src/storage/knowledge-repository.ts (NEW method)
export interface StorageBreakdown {
  totalBytes: number;
  pageSize: number;
  freelistBytes: number;
  walBytes: number;
  byCategory: Record<StorageCategory, number>;
  fallback?: 'page-count-only';
}
KnowledgeRepository.prototype.getStorageBreakdown(): StorageBreakdown;
```

## Data Flow

### Read path: `status` command

1. CLI `status.ts` calls `KnowledgeRepository.getStats()` (existing) and
   `getStorageBreakdown()` (new).
2. `getStorageBreakdown()` runs `SELECT name, SUM(payload + unused) FROM dbstat
GROUP BY name`. If `dbstat` is unavailable, falls back to `PRAGMA page_count
   - page_size`and reports`fallback: 'page-count-only'`.
3. Each table name is classified via `classifyTable()` (prefix-aware: `memory_*`
   → `memory`, `*_fts*` → `fts` unless prefix matched first).
4. Result rendered alongside the existing Database section in stderr-printed
   boxen output.

### Write path: `saveEmbedding` (UPDATED)

1. Caller passes `Float32Array` (output of ONNX model). The vector is
   already L2-normalized.
2. The float32 BLOB is written to `note_embeddings.embedding` unchanged
   (canonical storage for reranking and re-build).
3. The vector is uniformly quantized: `bytes[i] = clamp(round(v[i] * 127))`.
4. The int8 bytes are inserted into `note_embeddings_vec` via
   `INSERT ... VALUES (CAST(? AS INTEGER), vec_int8(?))` — the
   `vec_int8(?)` SQL wrapper is REQUIRED; binding raw bytes without it
   raises a sqlite-vec type error.

### Search path: `searchByVector` (UPDATED)

1. Caller passes `Float32Array` query.
2. Quantize the query: `qbytes[i] = clamp(round(q[i] * 127))`.
3. Coarse KNN: `SELECT note_id FROM note_embeddings_vec WHERE embedding
MATCH vec_int8(?) AND k = ? ORDER BY distance` where the `k` rowid is
   `OVERSAMPLE × topK` (default 10×, capped at 100). The `AND k = ?`
   clause is required for vec0 to actually rank — without it the virtual
   table returns rows in undefined order with `distance = NULL`.
4. Rerank: read the candidates' float32 BLOBs from `note_embeddings`,
   recompute exact L2 distances against the float32 query, sort, and keep
   the true top-K.
5. Score: `score = max(0, 1 - distance²/2)` (unchanged; the dequantized
   distance is L2 of two unit-norm vectors).

### Migration path: migration021

1. Compute `dbSize = page_count * page_size`. If > 50 MB, skip the
   `VACUUM` step and emit a warning so large-DB users don't block startup
   for tens of seconds. `auto_vacuum=INCREMENTAL` is still set; it takes
   effect on the next manual VACUUM.
2. `DROP TABLE note_embeddings_vec` (any pre-existing FLOAT[384] mirror).
3. `CREATE VIRTUAL TABLE note_embeddings_vec USING vec0(note_id INTEGER
PRIMARY KEY, embedding INT8[384])`. The `note_embeddings` BLOB column
   is left untouched — it remains float32 and is treated as canonical.
4. For each row in `note_embeddings` (chunked, 500 rows at a time):
   - Read the float32 BLOB.
   - Validate `length(embedding) = dimensions * 4` and `dimensions = 384`.
     If not, emit a warning with the `note_id` and skip the row.
   - Uniform-quantize and INSERT into `note_embeddings_vec` via
     `INSERT ... VALUES (CAST(? AS INTEGER), vec_int8(?))`.
   - Track progress; emit `[migration021] quantizing: N/M (XX%)` every 10 %.
5. `PRAGMA auto_vacuum=INCREMENTAL`. If the size guard allowed it, run
   `VACUUM`. Then `PRAGMA wal_checkpoint(TRUNCATE)`.
6. Emit `[migration021] done in Xs. before: A bytes, after: B bytes,
reduction: C%`. Internal ticket IDs are NOT included.

The migration is idempotent: re-running it observes that
`note_embeddings_vec` already has `INT8[384]` column type (probed via
`pragma_table_info`) and skips the rebuild; the float32 BLOBs are never
mutated.

## Key Design Decisions

### Decision 1: Uniform-scale int8 quantization (1/127)

- **Chosen**: `q = round(v * 127)` clamped to `[-128, 127]`, no per-vector
  scale stored. Valid because all embeddings are L2-normalized so each
  component lies in `[-1, 1]`.
- **Alternatives considered**:
  - Per-vector symmetric `scale = max(|v|)` stored alongside each row.
    Spike showed this breaks vec0 INT8 because the virtual table does not
    use the per-vector scale during distance computation, so two vectors
    quantized with different scales become incomparable.
  - Asymmetric quantization with `zero_point` — implementation complexity
    not justified by accuracy gains on L2-normalized inputs.
  - Int16 — 50 % reduction only and sqlite-vec does not support `INT16[N]`
    column types.
- **Rationale**: A single uniform scale lets vec0's internal L2 distance
  approximate the float32 L2 distance up to a multiplicative constant, which
  is exactly what KNN ordering depends on.

### Decision 2: Case A — keep float32 BLOB, quantize only the vec0 index, rerank from BLOB

- **Chosen**: `note_embeddings.embedding` stays as a `Float32Array` BLOB
  (1,536 B per 384-dim vector). `note_embeddings_vec` is replaced with
  `vec0(note_id INTEGER PRIMARY KEY, embedding INT8[384])`. At query time:
  1. Quantize the float32 query and run a coarse `MATCH vec_int8(?) AND k = N`
     where `N = 10 × topK` (e.g. 100 candidates for top-10).
  2. Read the candidates' float32 BLOBs and recompute exact L2 distances.
  3. Sort and return the true top-K.
- **Alternatives considered**:
  - Case A' (drop the float32 BLOB, store only int8): spike-measured
    Jaccard@10 vs the float32 baseline plateaus around 0.83–0.87 even on
    cluster-structured synthetic data — well below the AC-4 0.95 floor.
  - Case C (drop both float32 BLOB and run everything in int8): same
    accuracy floor, plus loses the ability to re-build the index from
    stored vectors without re-embedding.
- **Rationale**: Case A combines the storage win of an int8 vec0 index
  (~75 % reduction on the dominant vec0 portion of the embeddings bucket)
  with float32-quality KNN accuracy via post-fetch reranking. Phase 1.5
  measurement showed that the vec0 index makes up the majority of the
  embeddings bucket, so shrinking it dominates the savings.
- **Storage estimate** (Phase 1.5 synthetic data, 150 notes):
  - Before: `note_embeddings` 225 KB + vec0 (FLOAT[384]) ~1,635 KB ≈ 1.86 MB.
  - After Case A: `note_embeddings` 225 KB + vec0 (INT8[384]) ~410 KB ≈ 0.63 MB.
  - Saving on the embeddings bucket: ~66 %.
- **Spike fallback**: If even Case A's coarse-then-rerank flow fails to
  deliver AC-4 on real ONNX embeddings, fall back to Case A0: keep the
  vec0 table as `FLOAT[384]` and rely entirely on PRAGMA / VACUUM / index
  pruning for AC-1.

### Decision 3: format_version=2 reused for the new vec0 layout

- **Chosen**: Reuse the existing `format_version` column. After
  migration021, `format_version = 2` means "the float32 BLOB is canonical
  and the vec0 mirror is INT8 with uniform 1/127 scale." A reader that
  finds `format_version = 1` (legacy default) treats the BLOB the same way
  (still float32), and the vec0 mirror is regenerated by
  `ensureVectorIndexTable` on demand.
- **Alternatives considered**:
  - Add an `embedding_scale REAL` column for per-vector scale — abandoned
    along with the per-vector quantization path.
  - Bump `format_version` to `3` — unnecessary since the BLOB layout is
    unchanged; the only change is the mirror table column type.
- **Rationale**: Minimizes ALTER TABLE work and preserves the existing
  forward-only contract of migrations 019/020.

### Decision 4: dbstat vtab + explicit table-to-category map

- **Chosen**: Use `dbstat` (default-on in better-sqlite3 v11 amalgamation) and
  classify via `Record<string, StorageCategory>` mapping in
  `storage-categories.ts`.
- **Alternatives considered**:
  - Suffix-only regex (`_fts*`, `_vec*`) — fragile to future migrations.
  - Per-table `LENGTH(blob)` summation in app code — slow on large DBs.
- **Rationale**: Explicit map fails-loud when a new table is added (lands in
  `other`, prompting a code update). dbstat is fast and standard.

### Decision 5: Forward-only migration with size guard

- **Chosen**: `down()` is a no-op (matches migrations 019/020). Migration
  skips VACUUM if DB > 50 MB and emits a warning.
- **Alternatives considered**:
  - Reversible migration storing the float32 copy in a side table.
- **Rationale**: Reversible would defeat the size goal. The size guard
  protects existing large-DB users from a multi-second startup block.
  `KNOWLEDGINE_SKIP_AUTO_MIGRATE=1` provides an emergency opt-out.

## Migration Strategy

migration version = **21** (next sequential after 020). Registered in
`packages/core/src/index.ts`'s `ALL_MIGRATIONS` array. Order is determined by
the `version` field, not the filename.

| version | filename                             | role       |
| ------: | ------------------------------------ | ---------- |
|      20 | `020_memory_expires_at.ts`           | (existing) |
|  **21** | `021_embedding_int8_quantization.ts` | **NEW**    |

The migration is idempotent: re-running on an already-migrated DB results in
no UPDATEs (rows match the int8 byte-length predicate and are skipped).

The runtime DDL in `KnowledgeRepository.ensureVectorIndexTable` (currently
recreates `note_embeddings_vec` as `FLOAT[384]` if missing) MUST be updated
in lock-step to declare `INT8[384]`. Failing to do so produces a critical bug
where the migration succeeds but a fresh process recreates the index as
float32 on the next call.

### Category-to-table matrix

| Category     | Tables                                                                     |
| ------------ | -------------------------------------------------------------------------- |
| `notes`      | `knowledge_notes` (and its FTS tables → routed to `fts` instead)           |
| `fts`        | `knowledge_notes_fts*`, `entities_fts*`, `extraction_feedback_fts*`        |
| `embeddings` | `note_embeddings`, `note_embeddings_vec*`                                  |
| `graph`      | `entities`, `relations`, `observations`, `entity_note_links`, `provenance` |
| `events`     | `events`, `ingest_cursors`, `file_timeline`                                |
| `memory`     | `memory_entries`, `memory_entries_fts*` (prefix wins over FTS suffix)      |
| `other`      | anything not listed above                                                  |

`extracted_patterns` and `problem_solution_pairs` go to `notes` (they are
note-derived structured records).

## Security Considerations

- Migration logs intentionally exclude note content; only IDs and counts.
- No new dependencies are added.
- The opt-out env var `KNOWLEDGINE_SKIP_AUTO_MIGRATE` is read with the existing
  config-loading code path; no new exec/eval.

## Testing Strategy

- **Unit tests**:
  - `quantization.test.ts`: round-trip error < 1e-2 on L2-normalized vectors.
  - `storage-categories.test.ts`: known table names map to correct category;
    unknown names fall to `other`; `memory_entries_fts` resolves to `memory`.
  - `database.test.ts`: new PRAGMAs (`synchronous=NORMAL`, `cache_size=-20000`)
    are set on the connection.
- **Integration tests**:
  - `migration-021.test.ts`: full migration on a seeded float32 DB, verifying
    column types, byte lengths, idempotence, dimension-mismatch skip,
    `> 50 MB` guard, and that `Float32Array` cannot be bound directly to vec0.
  - `storage-breakdown.test.ts`: dbstat path, fallback path, sum reconciliation.
  - `status-breakdown.test.ts` (CLI): output contains the expected category
    lines.
- **Edge cases**:
  - Empty `note_embeddings` (semantic-disabled installs).
  - DB without `dbstat` compiled in.
  - Mixed legacy rows (`format_version=2` but `length(embedding)=1536`).

## Dependencies

- New dependencies: none.
- Modified packages: `@knowledgine/core`, `@knowledgine/cli`.
- Reused helpers: `packages/core/tests/helpers/test-db.ts` `createTestDb()`,
  `packages/cli/src/commands/status.ts` `formatBytes()`.
