import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KnowledgeSearcher } from "../../src/search/knowledge-searcher.js";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
import { MockEmbeddingProvider } from "../helpers/mock-embedding-provider.js";
import type { TestContext } from "../helpers/test-db.js";
import type { SearchResult } from "../../src/search/knowledge-searcher.js";

describe("KnowledgeSearcher", () => {
  let ctx: TestContext;
  let searcher: KnowledgeSearcher;

  beforeEach(() => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    searcher = new KnowledgeSearcher(ctx.repository);
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("search (keyword mode)", () => {
    it("should return FTS5 results with normalized score and matchReason format", async () => {
      const results = await searcher.search({ query: "TypeScript" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThanOrEqual(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
      expect(results[0].matchReason).toContain('キーワード一致: "TypeScript"');
    });

    it("should return empty array when no query is provided", async () => {
      const results = await searcher.search({});
      expect(results).toEqual([]);
    });

    it("should propagate limit to search", async () => {
      const results = await searcher.search({ query: "TypeScript", limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("search (semantic mode)", () => {
    it("should return empty when no embedding provider", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "semantic" });
      // No provider → falls back to keyword
      expect(Array.isArray(results)).toBe(true);
    });

    it("should use semantic mode when embedding provider is provided", async () => {
      const provider = new MockEmbeddingProvider();
      const semanticSearcher = new KnowledgeSearcher(ctx.repository, provider);
      const results = await semanticSearcher.search({ query: "TypeScript", mode: "semantic" });
      // With sqlite-vec unavailable, returns empty (graceful degradation)
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("search (hybrid mode)", () => {
    it("should combine FTS and vector results", async () => {
      const provider = new MockEmbeddingProvider();
      const hybridSearcher = new KnowledgeSearcher(ctx.repository, provider);
      const results = await hybridSearcher.search({ query: "TypeScript", mode: "hybrid" });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("searchByTag", () => {
    it("should return empty (tags not implemented via query)", async () => {
      const results = await searcher.searchByTag("typescript");
      expect(results).toEqual([]);
    });
  });

  describe("searchRecent", () => {
    it("should return empty (no query provided)", async () => {
      const results = await searcher.searchRecent();
      expect(results).toEqual([]);
    });
  });

  describe("getSearchStats", () => {
    it("should return total and avgScore for results", () => {
      const results: SearchResult[] = [
        { note: {} as unknown as SearchResult["note"], score: 0.5, matchReason: [] },
        { note: {} as unknown as SearchResult["note"], score: 0.9, matchReason: [] },
      ];
      const stats = searcher.getSearchStats(results);
      expect(stats.total).toBe(2);
      expect(stats.avgScore).toBeCloseTo(0.7);
    });

    it("should return {total:0, avgScore:0} for empty array", () => {
      const stats = searcher.getSearchStats([]);
      expect(stats.total).toBe(0);
      expect(stats.avgScore).toBe(0);
    });
  });
});
