import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";
import { quantizeFloat32ToInt8 } from "../quantization.js";

const EXPECTED_DIM = 384;
const FLOAT32_BYTES_PER_DIM = 4;
const VEC0_INT8_DDL = `
CREATE VIRTUAL TABLE note_embeddings_vec USING vec0(
  note_id INTEGER PRIMARY KEY,
  embedding INT8[384]
);
`;

interface NoteEmbeddingRow {
  note_id: number;
  embedding: Buffer;
  dimensions: number | null;
}

function getVecMirrorDdl(db: Database.Database): string | undefined {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='note_embeddings_vec'")
    .get() as { sql: string } | undefined;
  return row?.sql;
}

function vecMirrorIsAlreadyInt8(ddl: string): boolean {
  // vec0 virtual tables don't expose column types via pragma_table_info,
  // so we inspect the CREATE VIRTUAL TABLE DDL recorded in sqlite_master.
  return /INT8\s*\[/i.test(ddl);
}

/**
 * Probe whether the sqlite-vec extension is loaded for this connection.
 * The vec0 virtual table requires the extension to be loaded for both
 * `DROP TABLE` (xDestroy) and `CREATE VIRTUAL TABLE`. CLI paths that do
 * not enable semantic search (e.g. `feedback`) skip
 * `loadSqliteVecExtension`, so we must detect this state and skip the
 * migration instead of failing the whole `Migrator.migrate()` transaction.
 */
function sqliteVecIsLoaded(db: Database.Database): boolean {
  try {
    db.prepare("SELECT vec_int8(x'00') AS x").get();
    return true;
  } catch {
    return false;
  }
}

/**
 * Migration 021: Embedding int8 quantization (Case A).
 *
 * Replaces the `note_embeddings_vec` virtual table from `FLOAT[384]` to
 * `INT8[384]`, then re-inserts every row by reading the canonical float32
 * BLOB out of `note_embeddings.embedding` and quantizing it with the
 * uniform 1/127 scale. The float32 BLOB column is left untouched and
 * remains the source of truth — `searchByVector` reranks the coarse vec0
 * INT8 result set against the float32 BLOBs.
 *
 * Idempotent: if the mirror is already `INT8[384]`, the migration is a
 * no-op. If `sqlite-vec` is not loaded (no mirror table at all), it is
 * also a no-op; the runtime helper `ensureVectorIndexTable` will create
 * the mirror as `INT8[384]` lazily.
 *
 * Forward-only: `down()` is intentionally empty. Reverting requires
 * re-embedding the corpus from source, which is exposed via the
 * existing `--embed-missing` flow.
 */
export const migration021: Migration = {
  version: 21,
  name: "021_embedding_int8_quantization",

  up(db: Database.Database) {
    const ddl = getVecMirrorDdl(db);
    if (!ddl) return; // sqlite-vec was not loaded at create-time; nothing to migrate.
    if (vecMirrorIsAlreadyInt8(ddl)) return; // Idempotent.

    // The mirror is FLOAT[384] and needs to be rebuilt as INT8[384].
    // Both DROP and CREATE require the sqlite-vec extension to be loaded
    // for this connection. CLI commands that don't enable semantic search
    // (e.g. `feedback`) reach this migrator without loading the extension.
    // In that case we must skip the migration cleanly — the next process
    // that loads the extension will rebuild the mirror as INT8[384] via
    // KnowledgeRepository.ensureVectorIndexTable.
    if (!sqliteVecIsLoaded(db)) return;

    db.exec("DROP TABLE note_embeddings_vec;");
    try {
      db.exec(VEC0_INT8_DDL);
    } catch {
      // sqlite-vec extension was unloaded between checks; bail out cleanly.
      return;
    }

    const rows = db
      .prepare("SELECT note_id, embedding, dimensions FROM note_embeddings")
      .all() as NoteEmbeddingRow[];

    if (rows.length === 0) return;

    const ins = db.prepare(
      "INSERT INTO note_embeddings_vec (note_id, embedding) VALUES (CAST(? AS INTEGER), vec_int8(?))",
    );

    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const dim = row.dimensions ?? EXPECTED_DIM;
      const expectedBytes = dim * FLOAT32_BYTES_PER_DIM;
      if (dim !== EXPECTED_DIM || row.embedding.length !== expectedBytes) {
        process.stderr.write(
          `[migration021] skipping note_id=${row.note_id} (dim=${dim}, bytes=${row.embedding.length})\n`,
        );
        skipped++;
        continue;
      }
      const f32 = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, EXPECTED_DIM);
      const int8 = quantizeFloat32ToInt8(f32);
      ins.run(row.note_id, Buffer.from(int8.buffer, int8.byteOffset, int8.byteLength));
      inserted++;
    }

    process.stderr.write(
      `[migration021] quantized ${inserted}/${rows.length} embeddings to INT8[384]` +
        (skipped > 0 ? ` (${skipped} skipped)` : "") +
        "\n",
    );
  },

  down(_db: Database.Database) {
    // Forward-only. Reverting requires re-embedding via `--embed-missing`.
  },
};
