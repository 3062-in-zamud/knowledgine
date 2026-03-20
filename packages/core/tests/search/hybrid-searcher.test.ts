import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HybridSearcher } from "../../src/search/hybrid-searcher.js";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
import { MockEmbeddingProvider } from "../helpers/mock-embedding-provider.js";
import type { TestContext } from "../helpers/test-db.js";

describe("HybridSearcher", () => {
  let ctx: TestContext;
  let provider: MockEmbeddingProvider;
  let searcher: HybridSearcher;

  beforeEach(() => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    provider = new MockEmbeddingProvider();
    searcher = new HybridSearcher(ctx.repository, provider, 0.3);
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("should return FTS-only results when vector search is unavailable", async () => {
    const results = await searcher.search("TypeScript");
    // FTS should find notes mentioning TypeScript
    expect(results.length).toBeGreaterThan(0);
  });

  it("should include match reasons", async () => {
    const results = await searcher.search("TypeScript");
    for (const result of results) {
      expect(result.matchReason.length).toBeGreaterThan(0);
    }
  });

  it("should return empty array for query with no matches", async () => {
    const results = await searcher.search("xyznonexistentterm123456");
    expect(results).toEqual([]);
  });

  it("should respect the limit parameter", async () => {
    const results = await searcher.search("TypeScript", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("should return scores between 0 and 1", async () => {
    const results = await searcher.search("TypeScript");
    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });
});
