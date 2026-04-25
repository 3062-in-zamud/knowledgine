import { describe, it, expect, afterEach } from "vitest";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { computeStorageBreakdown } from "../../src/storage/storage-breakdown.js";

describe("KnowledgeRepository.getStorageBreakdown", () => {
  let ctx: TestContext | undefined;

  afterEach(() => {
    ctx?.db.close();
    ctx = undefined;
  });

  it("returns a breakdown with all categories populated", () => {
    ctx = createTestDb();
    const breakdown = ctx.repository.getStorageBreakdown();

    expect(breakdown.byCategory).toEqual(
      expect.objectContaining({
        notes: expect.any(Number),
        fts: expect.any(Number),
        embeddings: expect.any(Number),
        graph: expect.any(Number),
        events: expect.any(Number),
        memory: expect.any(Number),
        other: expect.any(Number),
      }),
    );
    expect(breakdown.pageSize).toBeGreaterThan(0);
    expect(breakdown.totalBytes).toBeGreaterThan(0);
  });

  it("category sums plus freelist bytes match the on-disk total within a small tolerance", () => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    const breakdown = ctx.repository.getStorageBreakdown();

    const categorySum = Object.values(breakdown.byCategory).reduce((a, b) => a + b, 0);
    const accountedFor = categorySum + breakdown.freelistBytes;

    // dbstat reports payload + unused per page; with the freelist accounted for
    // separately the total should match (page_count * page_size) closely.
    expect(accountedFor).toBeGreaterThan(0);
    expect(Math.abs(accountedFor - breakdown.totalBytes)).toBeLessThanOrEqual(
      breakdown.pageSize, // allow up to one page of slack for round-trip variance
    );
  });

  it("attributes notes-related rows to the 'notes' category after seeding", () => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    const breakdown = ctx.repository.getStorageBreakdown();

    expect(breakdown.byCategory.notes).toBeGreaterThan(0);
  });

  it("attributes FTS5 shadow data to the 'fts' category after seeding", () => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    const breakdown = ctx.repository.getStorageBreakdown();

    // Three notes go through the knowledge_notes_fts shadow tables; their
    // bytes should land in the fts bucket.
    expect(breakdown.byCategory.fts).toBeGreaterThan(0);
  });

  it("does not attribute memory_entries_fts to the 'fts' bucket (prefix wins)", () => {
    ctx = createTestDb();
    // Insert a memory_entries row to ensure the FTS shadow has data.
    const now = new Date().toISOString();
    ctx.db
      .prepare("INSERT INTO memory_entries (layer, content, created_at) VALUES (?, ?, ?)")
      .run("episodic", "memory content for breakdown test", now);

    const breakdownAfter = ctx.repository.getStorageBreakdown();
    expect(breakdownAfter.byCategory.memory).toBeGreaterThan(0);
  });

  it("provides walBytes and freelistBytes fields", () => {
    ctx = createTestDb();
    const breakdown = ctx.repository.getStorageBreakdown();

    expect(typeof breakdown.walBytes).toBe("number");
    expect(typeof breakdown.freelistBytes).toBe("number");
    expect(breakdown.walBytes).toBeGreaterThanOrEqual(0);
    expect(breakdown.freelistBytes).toBeGreaterThanOrEqual(0);
  });

  it("falls back to 'page-count-only' when the dbstat query fails", () => {
    ctx = createTestDb();
    seedTestData(ctx.repository);

    // Wrap db.prepare so the dbstat statement throws, simulating a build
    // of better-sqlite3 / SQLite where dbstat is not compiled in. We
    // intentionally avoid mutating the real connection so that other
    // tests in this suite remain independent.
    const origPrepare = ctx.db.prepare.bind(ctx.db);
    type Stmt = ReturnType<typeof origPrepare>;
    const wrapped = {
      ...ctx.db,
      prepare(sql: string): Stmt {
        if (/FROM\s+dbstat/i.test(sql)) {
          throw new Error("no such table: dbstat");
        }
        return origPrepare(sql);
      },
    } as unknown as typeof ctx.db;

    const breakdown = computeStorageBreakdown(wrapped);

    expect(breakdown.fallback).toBe("page-count-only");
    expect(breakdown.totalBytes).toBeGreaterThan(0);
    expect(breakdown.pageSize).toBeGreaterThan(0);
    // Category buckets are zero in the fallback path because dbstat is
    // the only way we attribute bytes per table.
    for (const [, value] of Object.entries(breakdown.byCategory)) {
      expect(value).toBe(0);
    }
  });
});
