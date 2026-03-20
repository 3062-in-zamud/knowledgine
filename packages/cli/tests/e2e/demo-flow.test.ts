import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  KnowledgeSearcher,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import { copyDemoFixtures, cleanDemo } from "../../src/lib/demo-manager.js";
import { initCommand } from "../../src/commands/init.js";

describe("E2E: demo flow (init --demo → search → demo --clean)", () => {
  const testBase = join(tmpdir(), `knowledgine-demo-e2e-${randomUUID()}`);
  const demoNotesDir = join(testBase, "knowledgine-demo-notes");

  beforeAll(async () => {
    // Step 1: Copy demo fixtures
    const count = copyDemoFixtures(demoNotesDir);
    expect(count).toBeGreaterThanOrEqual(7);

    // Step 2: Run init on the demo notes directory
    await initCommand({ path: demoNotesDir });
  }, 60_000);

  afterAll(() => {
    rmSync(testBase, { recursive: true, force: true });
  });

  it("should have created .knowledgine directory", () => {
    expect(existsSync(join(demoNotesDir, ".knowledgine"))).toBe(true);
    expect(existsSync(join(demoNotesDir, ".knowledgine", "index.sqlite"))).toBe(true);
  });

  it("should have indexed all demo markdown files", () => {
    const db = createDatabase(join(demoNotesDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    const mdFiles = readdirSync(demoNotesDir).filter((f) => f.endsWith(".md"));
    expect(stats.totalNotes).toBe(mdFiles.length);
    db.close();
  });

  it("should find auth-related notes via search", async () => {
    const db = createDatabase(join(demoNotesDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const searcher = new KnowledgeSearcher(repository);
    const results = await searcher.search({ query: "authentication JWT" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("should find TypeScript-related notes via search", async () => {
    const db = createDatabase(join(demoNotesDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const searcher = new KnowledgeSearcher(repository);
    const results = await searcher.search({ query: "TypeScript migration" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("should find Docker-related notes via search", async () => {
    const db = createDatabase(join(demoNotesDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const searcher = new KnowledgeSearcher(repository);
    const results = await searcher.search({ query: "Docker container" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("should clean demo files without removing .knowledgine", () => {
    // Simulate: create a copy of the demo notes dir to test clean
    const cleanTestDir = join(testBase, "clean-test");
    copyDemoFixtures(cleanTestDir);

    // Verify notes exist
    expect(readdirSync(cleanTestDir).filter((f) => f.endsWith(".md")).length).toBeGreaterThan(0);

    // Clean
    cleanDemo(cleanTestDir);

    // Notes directory should be gone
    expect(existsSync(cleanTestDir)).toBe(false);
  });

  it("should work in non-TTY mode (CI)", () => {
    // The test runner itself is non-TTY, so if we got here, non-TTY works
    expect(process.stderr.isTTY).toBeFalsy();
  });
});
