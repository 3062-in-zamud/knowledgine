import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ALL_MIGRATIONS,
  KnowledgeRepository,
  Migrator,
  createDatabase,
  loadSqliteVecExtension,
} from "../../src/index.js";
import { buildStorageFixture } from "./storage-bench-fixture.js";

/**
 * Compares on-disk database size with and without migration021. Acts as a
 * regression guard for the embeddings-bucket reduction; the absolute
 * AC-1 limit (≤ 10 MB on real honojs/hono) is verified manually in the
 * Phase 4 Gate B end-to-end runs.
 */
describe("DB size bench: migration020 vs migration021", () => {
  it("after / before ratio is <= 0.7 on the synthetic 150-note fixture", async () => {
    const dir = mkdtempSync(join(tmpdir(), "know404-size-"));

    try {
      // --- Baseline (migration <= 020): vec0 = FLOAT[384] ---
      const baselinePath = join(dir, "baseline.sqlite");
      const baselineMigs = ALL_MIGRATIONS.filter((m) => m.version <= 20);

      {
        const db = createDatabase(baselinePath);
        await loadSqliteVecExtension(db);
        new Migrator(db, baselineMigs).migrate();
        const repo = new KnowledgeRepository(db);
        const fx = buildStorageFixture(42);
        for (let i = 0; i < fx.notes.length; i++) {
          const id = repo.saveNote({
            filePath: fx.notes[i].filePath,
            title: fx.notes[i].title,
            content: fx.notes[i].content,
            frontmatter: { tags: fx.notes[i].tags },
            createdAt: fx.notes[i].createdAt,
          });
          // Insert directly into the baseline FLOAT[384] vec0 to avoid
          // saveEmbedding's quantized path (which is the optimization
          // we're trying to compare against).
          const f32 = fx.embeddings[i];
          const blob = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
          db.prepare(
            "INSERT INTO note_embeddings (note_id, embedding, model_name, dimensions, created_at, format_version) VALUES (?, ?, 'm', 384, datetime('now'), 1)",
          ).run(id, blob);
          db.prepare(
            "INSERT INTO note_embeddings_vec (note_id, embedding) VALUES (CAST(? AS INTEGER), ?)",
          ).run(id, blob);
        }
        db.pragma("wal_checkpoint(TRUNCATE)");
        db.close();
      }

      const baselineBytes = statSync(baselinePath).size;

      // --- Optimized (migration021 applied): vec0 = INT8[384] via saveEmbeddingBatch ---
      const optimizedPath = join(dir, "optimized.sqlite");
      {
        const db = createDatabase(optimizedPath);
        await loadSqliteVecExtension(db);
        new Migrator(db, ALL_MIGRATIONS).migrate();
        const repo = new KnowledgeRepository(db);
        const fx = buildStorageFixture(42);
        // Use the production saveEmbedding path (which uses vec_int8(?)).
        const noteIds: number[] = [];
        for (let i = 0; i < fx.notes.length; i++) {
          const id = repo.saveNote({
            filePath: fx.notes[i].filePath,
            title: fx.notes[i].title,
            content: fx.notes[i].content,
            frontmatter: { tags: fx.notes[i].tags },
            createdAt: fx.notes[i].createdAt,
          });
          noteIds.push(id);
        }
        repo.saveEmbeddingBatch(
          fx.embeddings.map((e, i) => ({ noteId: noteIds[i], embedding: e, modelName: "m" })),
        );
        db.pragma("wal_checkpoint(TRUNCATE)");
        db.close();
      }

      const optimizedBytes = statSync(optimizedPath).size;
      const ratio = optimizedBytes / baselineBytes;

      // We aim for the AC-1 16→10 MB ratio (≤ 0.625) on real data, but the
      // synthetic fixture has a smaller absolute size where overheads
      // dominate; allow ≤ 0.7 here so the bench stays meaningful without
      // becoming flaky. The strict 0.625 target is verified manually in
      // Gate B with real GitHub data.
      expect(ratio).toBeLessThanOrEqual(0.7);

      console.log(
        `[db-size-bench] baseline=${baselineBytes} optimized=${optimizedBytes} ratio=${ratio.toFixed(3)}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
