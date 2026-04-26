import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { createDatabase, loadSqliteVecExtension } from "../../src/storage/database.js";
import { Migrator } from "../../src/storage/migrator.js";
import { ALL_MIGRATIONS } from "../../src/index.js";
import { migration021 } from "../../src/storage/migrations/021_embedding_int8_quantization.js";
import { quantizeFloat32ToInt8 } from "../../src/storage/quantization.js";

function migrationsBefore21() {
  // Only migrations strictly older than 21. Filtering by `!== 21` was
  // safe while 21 was the latest; with 22+ in the array, that filter
  // would let later migrations run first and the Migrator would then
  // skip migration021 (its version is below the current max).
  return ALL_MIGRATIONS.filter((m) => m.version < 21);
}

function makeF32(seed: number, dim = 384): Float32Array {
  const v = new Float32Array(dim);
  let s = seed >>> 0;
  let n = 0;
  for (let i = 0; i < dim; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    v[i] = (s / 0xffffffff) * 2 - 1;
    n += v[i] * v[i];
  }
  n = Math.sqrt(n);
  for (let i = 0; i < dim; i++) v[i] /= n;
  return v;
}

describe("migration021: embedding int8 quantization (vec0 INT8[384])", () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createDatabase(":memory:");
    await loadSqliteVecExtension(db);
    new Migrator(db, migrationsBefore21()).migrate();
  });

  afterEach(() => {
    db.close();
  });

  it("converts the vec0 mirror column to INT8[384]", () => {
    new Migrator(db, [migration021]).migrate();
    const ddl = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='note_embeddings_vec'")
      .get() as { sql: string } | undefined;
    expect(ddl?.sql).toBeDefined();
    expect(ddl!.sql.toUpperCase()).toContain("INT8[384]");
  });

  it("leaves note_embeddings BLOBs unchanged (float32 stays canonical)", () => {
    const v = makeF32(7);
    const blob = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    db.prepare(
      "INSERT INTO knowledge_notes (id, file_path, title, content, created_at) VALUES (1, 'a.md', 'a', 'x', datetime('now'))",
    ).run();
    db.prepare(
      "INSERT INTO note_embeddings (note_id, embedding, model_name, dimensions, created_at) VALUES (1, ?, 'm', 384, datetime('now'))",
    ).run(blob);

    new Migrator(db, [migration021]).migrate();

    const row = db.prepare("SELECT embedding FROM note_embeddings WHERE note_id = 1").get() as {
      embedding: Buffer;
    };
    expect(row.embedding.length).toBe(384 * 4);
    // Bytes must be byte-for-byte identical.
    expect(Buffer.compare(row.embedding, blob)).toBe(0);
  });

  it("re-inserts existing float32 BLOBs into the INT8 vec0 mirror", () => {
    const v = makeF32(11);
    const blob = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    db.prepare(
      "INSERT INTO knowledge_notes (id, file_path, title, content, created_at) VALUES (1, 'a.md', 'a', 'x', datetime('now'))",
    ).run();
    db.prepare(
      "INSERT INTO note_embeddings (note_id, embedding, model_name, dimensions, created_at) VALUES (1, ?, 'm', 384, datetime('now'))",
    ).run(blob);

    new Migrator(db, [migration021]).migrate();

    const found = db
      .prepare(
        "SELECT note_id FROM note_embeddings_vec WHERE embedding MATCH vec_int8(?) AND k = 1 ORDER BY distance",
      )
      .all(Buffer.from(quantizeFloat32ToInt8(v).buffer)) as Array<{ note_id: number }>;
    expect(found).toHaveLength(1);
    expect(found[0].note_id).toBe(1);
  });

  it("is idempotent: running again produces no UPDATE and no error", () => {
    const v = makeF32(13);
    db.prepare(
      "INSERT INTO knowledge_notes (id, file_path, title, content, created_at) VALUES (1, 'a.md', 'a', 'x', datetime('now'))",
    ).run();
    db.prepare(
      "INSERT INTO note_embeddings (note_id, embedding, model_name, dimensions, created_at) VALUES (1, ?, 'm', 384, datetime('now'))",
    ).run(Buffer.from(v.buffer, v.byteOffset, v.byteLength));

    new Migrator(db, [migration021]).migrate();
    // Second run should be a no-op (already INT8[384]).
    expect(() => migration021.up(db)).not.toThrow();

    // Result row count remains 1.
    const count = db.prepare("SELECT COUNT(*) as c FROM note_embeddings_vec").get() as {
      c: number;
    };
    expect(count.c).toBe(1);
  });

  it("is a no-op when note_embeddings is empty", () => {
    new Migrator(db, [migration021]).migrate();
    const count = db.prepare("SELECT COUNT(*) as c FROM note_embeddings_vec").get() as {
      c: number;
    };
    expect(count.c).toBe(0);
  });

  it("skips rows whose dimensions don't match (warns, doesn't throw)", () => {
    const wrongDim = new Float32Array(128);
    for (let i = 0; i < 128; i++) wrongDim[i] = 0.1;
    const blob = Buffer.from(wrongDim.buffer, wrongDim.byteOffset, wrongDim.byteLength);
    db.prepare(
      "INSERT INTO knowledge_notes (id, file_path, title, content, created_at) VALUES (1, 'a.md', 'a', 'x', datetime('now'))",
    ).run();
    db.prepare(
      "INSERT INTO note_embeddings (note_id, embedding, model_name, dimensions, created_at) VALUES (1, ?, 'm', 128, datetime('now'))",
    ).run(blob);

    expect(() => new Migrator(db, [migration021]).migrate()).not.toThrow();

    const count = db.prepare("SELECT COUNT(*) as c FROM note_embeddings_vec").get() as {
      c: number;
    };
    expect(count.c).toBe(0);
  });

  it("rejects raw float32 buffers bound directly (regression guard for vec_int8 wrapper)", () => {
    new Migrator(db, [migration021]).migrate();
    const v = makeF32(5);
    const f32Buf = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    expect(() =>
      db
        .prepare(
          "INSERT INTO note_embeddings_vec (note_id, embedding) VALUES (CAST(? AS INTEGER), ?)",
        )
        .run(1, f32Buf),
    ).toThrow();
  });
});

describe("migration021 is included in ALL_MIGRATIONS", () => {
  it("applies migration021 when running ALL_MIGRATIONS", async () => {
    const db = createDatabase(":memory:");
    await loadSqliteVecExtension(db);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const ddl = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='note_embeddings_vec'")
      .get() as { sql: string } | undefined;
    expect(ddl?.sql).toBeDefined();
    expect(ddl!.sql.toUpperCase()).toContain("INT8");
    db.close();
  });
});

describe("migration021 — sqlite-vec unavailable", () => {
  // Regression guard for the codex P1 finding: if a CLI path runs
  // Migrator.migrate() against an upgraded database that already has a
  // FLOAT[384] note_embeddings_vec mirror, but does NOT load sqlite-vec
  // first, migration021 must skip cleanly instead of aborting the whole
  // migration transaction with `no such module: vec0`.
  it("does not throw when the sqlite-vec extension is not loaded", async () => {
    // Step 1: prepare a database that has the FLOAT[384] mirror (i.e. an
    // older install that ran migration003 with sqlite-vec available).
    const db1 = createDatabase(":memory:");
    await loadSqliteVecExtension(db1);
    new Migrator(db1, migrationsBefore21()).migrate();
    // Serialize so we can re-open the same DB content without the extension.
    const buf = db1.serialize();
    db1.close();

    // Step 2: re-open the DB but DON'T load sqlite-vec, then run migrate.
    // The previously-applied migration003 created note_embeddings_vec
    // (FLOAT[384]) and recorded itself in schema_version, so migrate()
    // sees migration021 as the only pending migration and runs it.
    const Database = (await import("better-sqlite3")).default;
    const db2 = new Database(buf);
    expect(() => new Migrator(db2, [migration021]).migrate()).not.toThrow();
    db2.close();
  });
});
