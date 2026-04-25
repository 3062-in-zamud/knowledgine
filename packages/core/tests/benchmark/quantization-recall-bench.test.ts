import { describe, it, expect } from "vitest";
import {
  ALL_MIGRATIONS,
  KnowledgeRepository,
  Migrator,
  createDatabase,
  loadSqliteVecExtension,
} from "../../src/index.js";
import { buildStorageFixture, buildClusterQuery } from "./storage-bench-fixture.js";

/**
 * Recall benchmark: compare top-10 returned by `KnowledgeRepository.searchByVector`
 * (vec0 INT8[384] + float32-BLOB rerank) against a float32 baseline using a
 * separate vec0 FLOAT[384] table. Asserts mean Jaccard@10 ≥ 0.95.
 *
 * Runtime budget: ~3-5 s on a modern laptop. Caps below keep total work
 * small enough to fit comfortably under any vitest timeout.
 */
describe("Quantization recall bench: rerank vs float32 baseline", () => {
  it("achieves mean Jaccard@10 >= 0.95 on cluster-structured synthetic data", async () => {
    const db = createDatabase(":memory:");
    await loadSqliteVecExtension(db);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repo = new KnowledgeRepository(db);

    // --- Build a 1000-note corpus and write embeddings via the production path ---
    // We scale the fixture up to 1000 by mixing 6-7 seed offsets.
    const SEEDS = [11, 22, 33, 44, 55, 66, 77];
    const allEmb: Float32Array[] = [];
    const noteIds: number[] = [];
    const baseDate = new Date("2025-01-01T00:00:00Z").getTime();

    let counter = 0;
    for (const seed of SEEDS) {
      const fx = buildStorageFixture(seed);
      for (let i = 0; i < fx.notes.length; i++) {
        const note = fx.notes[i];
        const id = repo.saveNote({
          filePath: `bench://${seed}/${note.filePath}/${counter}`,
          title: `${note.title} (seed ${seed})`,
          content: note.content,
          frontmatter: { tags: note.tags },
          createdAt: new Date(baseDate + counter * 1000).toISOString(),
        });
        noteIds.push(id);
        allEmb.push(fx.embeddings[i]);
        counter++;
      }
      if (allEmb.length >= 1000) break;
    }

    // Cap at 1000 to keep runtime predictable.
    const N = Math.min(1000, allEmb.length);
    repo.saveEmbeddingBatch(
      allEmb.slice(0, N).map((e, i) => ({ noteId: noteIds[i], embedding: e, modelName: "m" })),
    );

    // --- Float32 baseline: separate vec0 FLOAT[384] with the same corpus ---
    db.exec(`
      CREATE VIRTUAL TABLE bench_baseline USING vec0(
        rowid INTEGER PRIMARY KEY,
        embedding FLOAT[384]
      )
    `);
    const insBaseline = db.prepare(
      "INSERT INTO bench_baseline (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)",
    );
    for (let i = 0; i < N; i++) {
      insBaseline.run(
        noteIds[i],
        Buffer.from(allEmb[i].buffer, allEmb[i].byteOffset, allEmb[i].byteLength),
      );
    }

    // --- Compare top-10 over 100 queries ---
    const Q = 100;
    const K = 10;
    let jaccardSum = 0;
    const baselineStmt = db.prepare(
      "SELECT rowid AS note_id FROM bench_baseline WHERE embedding MATCH ? AND k = ? ORDER BY distance",
    );
    for (let qi = 0; qi < Q; qi++) {
      const q = buildClusterQuery(1000 + qi);
      const baselineTop = (
        baselineStmt.all(Buffer.from(q.buffer, q.byteOffset, q.byteLength), K) as Array<{
          note_id: number;
        }>
      ).map((r) => r.note_id);

      const rerankTop = repo.searchByVector(q, K).map((r) => r.note_id);

      const setA = new Set(baselineTop);
      const setB = new Set(rerankTop);
      const inter = [...setA].filter((x) => setB.has(x)).length;
      const union = new Set([...setA, ...setB]).size;
      jaccardSum += union === 0 ? 1 : inter / union;
    }
    const meanJaccard = jaccardSum / Q;
    console.log(`[recall-bench] N=${N} Q=${Q} mean Jaccard@${K} = ${meanJaccard.toFixed(4)}`);

    expect(meanJaccard).toBeGreaterThanOrEqual(0.95);

    db.close();
  }, 60_000);
});
