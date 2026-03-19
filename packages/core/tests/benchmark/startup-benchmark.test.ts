import { describe, it, expect } from "vitest";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "../../src/index.js";

describe("Startup Benchmark", () => {
  it("should initialize database within performance budget", () => {
    const start = performance.now();
    const db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    const elapsed = performance.now() - start;

    console.log(`[Benchmark] Startup: ${elapsed.toFixed(1)}ms`);
    console.log(`[Benchmark] Target: <3s (ideal), <10s (CI threshold)`);
    console.log(`[Benchmark] Stats: ${JSON.stringify(stats)}`);

    expect(stats.totalNotes).toBe(0);
    expect(elapsed).toBeLessThan(10_000); // CI threshold

    db.close();
  });

  it("should not degrade on duplicate migration runs", () => {
    const db = createDatabase(":memory:");
    const migrator = new Migrator(db, ALL_MIGRATIONS);

    const start = performance.now();
    migrator.migrate();
    const firstRun = performance.now() - start;

    const secondStart = performance.now();
    migrator.migrate();
    const secondRun = performance.now() - secondStart;

    console.log(`[Benchmark] First migration: ${firstRun.toFixed(1)}ms`);
    console.log(`[Benchmark] Second migration (noop): ${secondRun.toFixed(1)}ms`);

    // Second run should not be significantly slower
    expect(secondRun).toBeLessThan(firstRun * 3 + 100); // Allow some variance

    db.close();
  });
});
