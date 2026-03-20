import { describe, it, expect } from "vitest";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  KnowledgeSearcher,
  ALL_MIGRATIONS,
} from "../../src/index.js";

describe("Search Benchmark", () => {
  it("should search 1000 notes within performance budget", async () => {
    const db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    // Seed 1000 notes
    const now = new Date().toISOString();
    for (let i = 0; i < 1000; i++) {
      repository.saveNote({
        filePath: `note-${i}.md`,
        title: `Note ${i} about ${["TypeScript", "React", "Node.js", "Testing", "Performance"][i % 5]}`,
        content: `Content for note ${i}. ${["TypeScript is great", "React hooks are useful", "Node.js is fast", "Testing is important", "Performance matters"][i % 5]}. Additional text for search indexing.`,
        frontmatter: { tags: [["typescript", "react", "nodejs", "testing", "performance"][i % 5]] },
        createdAt: now,
      });
    }

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
});
