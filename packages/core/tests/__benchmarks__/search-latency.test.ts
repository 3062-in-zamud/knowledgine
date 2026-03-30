import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "../../src/index.js";
import type Database from "better-sqlite3";

describe("keyword search latency", () => {
  let db: Database.Database;
  let repo: KnowledgeRepository;

  beforeAll(() => {
    db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    repo = new KnowledgeRepository(db);

    // Seed 1000 notes with realistic content
    const transaction = db.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        repo.saveNote({
          filePath: `notes/note-${i}.md`,
          title: `Note ${i}: ${["TypeScript patterns", "React hooks", "Node.js debugging", "API design", "Database optimization"][i % 5]}`,
          content: `This is note ${i} about ${["authentication flow using OAuth2 and JWT tokens", "React component lifecycle and state management", "debugging memory leaks in Node.js applications", "RESTful API design with proper error handling", "SQL query optimization and indexing strategies"][i % 5]}. It contains relevant technical details about software development practices and patterns that developers commonly encounter in production systems.`,
          frontmatter: {},
          createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        });
      }
    });
    transaction();
  });

  afterAll(() => {
    db.close();
  });

  it("should complete keyword search within 200ms P50 (1K notes)", () => {
    const times: number[] = [];
    const queries = ["TypeScript", "authentication", "React hooks", "debugging", "API design"];

    // Warm up
    for (const q of queries) {
      repo.searchNotesWithRank(q, 20);
    }

    // Measure
    for (let run = 0; run < 50; run++) {
      for (const q of queries) {
        const start = performance.now();
        repo.searchNotesWithRank(q, 20);
        times.push(performance.now() - start);
      }
    }

    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];

    console.log(`P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms`);
    expect(p50).toBeLessThan(200);
    expect(p95).toBeLessThan(1000);
  });
});
