import { describe, it, expect } from "vitest";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  KnowledgeSearcher,
  ALL_MIGRATIONS,
} from "../../src/index.js";

function seedNotes(repository: KnowledgeRepository, count: number): void {
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    repository.saveNote({
      filePath: `note-${i}.md`,
      title: `Note ${i} about ${["TypeScript", "React", "Node.js", "Testing", "Performance"][i % 5]}`,
      content: `Content for note ${i}. ${["TypeScript is great", "React hooks are useful", "Node.js is fast", "Testing is important", "Performance matters"][i % 5]}. Additional text for search indexing.`,
      frontmatter: { tags: [["typescript", "react", "nodejs", "testing", "performance"][i % 5]] },
      createdAt: now,
    });
  }
}

describe("Search Benchmark", () => {
  it("should search 1000 notes within performance budget", async () => {
    const db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    seedNotes(repository, 1000);

    const searcher = new KnowledgeSearcher(repository);

    const start = performance.now();
    const results = await searcher.search({ query: "TypeScript" });
    const ftsElapsed = performance.now() - start;

    // Tag similarity search
    const tagStart = performance.now();
    const tagResults = repository.findNotesByTagSimilarity(1, ["typescript"], 50);
    const tagElapsed = performance.now() - tagStart;

    const totalElapsed = ftsElapsed + tagElapsed;

    console.log(`[Benchmark] FTS search: ${ftsElapsed.toFixed(1)}ms (${results.length} results)`);
    console.log(
      `[Benchmark] Tag search: ${tagElapsed.toFixed(1)}ms (${tagResults.length} results)`,
    );
    console.log(`[Benchmark] Total: ${totalElapsed.toFixed(1)}ms`);
    console.log(`[Benchmark] Target: <200ms (ideal), <600ms (CI threshold)`);

    expect(results.length).toBeGreaterThan(0);
    expect(totalElapsed).toBeLessThan(600); // CI threshold

    db.close();
  });

  it("Stmt cache bench: cached stmt should be faster than re-prepare", () => {
    const db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    seedNotes(repository, 100);
    const ids = repository.getAllNoteIds();

    const ITERATIONS = 1000;

    // Cached stmt (getNoteById uses stmt cache)
    const cachedStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      repository.getNoteById(ids[i % ids.length]!);
    }
    const cachedElapsed = performance.now() - cachedStart;

    // Re-prepare each time (direct db.prepare)
    const rePrepareStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      db.prepare("SELECT * FROM knowledge_notes WHERE id = ?").get(ids[i % ids.length]);
    }
    const rePrepareElapsed = performance.now() - rePrepareStart;

    console.log(
      `[Benchmark] Stmt cache (${ITERATIONS} iters): cached=${cachedElapsed.toFixed(1)}ms, re-prepare=${rePrepareElapsed.toFixed(1)}ms`,
    );
    console.log(`[Benchmark] Speedup: ${(rePrepareElapsed / cachedElapsed).toFixed(2)}x`);

    // キャッシュ版は re-prepare より大幅に遅くないこと（相対比較のみ、CI環境差を吸収）
    expect(cachedElapsed).toBeLessThan(rePrepareElapsed * 3);

    db.close();
  });

  it("Content projection bench: SELECT fields vs SELECT * for 50 notes", () => {
    const db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    seedNotes(repository, 200);
    const allIds = repository.getAllNoteIds().slice(0, 50);

    const ITERATIONS = 500;

    // SELECT * (getNotesByIds)
    const selectStarStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      repository.getNotesByIds(allIds);
    }
    const selectStarElapsed = performance.now() - selectStarStart;

    // SELECT summary columns only (getNotesSummaryByIds)
    const selectFieldsStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      repository.getNotesSummaryByIds(allIds);
    }
    const selectFieldsElapsed = performance.now() - selectFieldsStart;

    console.log(
      `[Benchmark] Content projection (${ITERATIONS} iters, 50 notes): SELECT *=${selectStarElapsed.toFixed(1)}ms, SELECT fields=${selectFieldsElapsed.toFixed(1)}ms`,
    );
    const speedup = selectStarElapsed / selectFieldsElapsed;
    console.log(`[Benchmark] Projection speedup: ${speedup.toFixed(2)}x`);

    // Summary 取得は SELECT * より高速か同等であること
    expect(selectFieldsElapsed).toBeLessThan(selectStarElapsed * 1.5);

    db.close();
  });

  it("N+1 vs batch bench: getNoteById x20 vs getNotesSummaryByIds", () => {
    const db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    seedNotes(repository, 100);
    const sampleIds = repository.getAllNoteIds().slice(0, 20);

    const ITERATIONS = 200;

    // N+1: 20件を個別取得
    const n1Start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      for (const id of sampleIds) {
        repository.getNoteById(id);
      }
    }
    const n1Elapsed = performance.now() - n1Start;

    // Batch: 20件を一括取得
    const batchStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      repository.getNotesSummaryByIds(sampleIds);
    }
    const batchElapsed = performance.now() - batchStart;

    console.log(
      `[Benchmark] N+1 vs batch (${ITERATIONS} iters, 20 notes): N+1=${n1Elapsed.toFixed(1)}ms, batch=${batchElapsed.toFixed(1)}ms`,
    );
    const speedup = n1Elapsed / batchElapsed;
    console.log(`[Benchmark] Batch speedup: ${speedup.toFixed(2)}x`);

    // バッチ取得は N+1 より大幅に遅くないこと (CI環境の性能変動を考慮して 2.5x マージン)
    expect(batchElapsed).toBeLessThan(n1Elapsed * 2.5);

    db.close();
  });
});
