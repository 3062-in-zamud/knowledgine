import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KnowledgeSearcher } from "../../src/search/knowledge-searcher.js";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
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

  describe("search", () => {
    it("should return FTS5 results with score=0.5 and matchReason format", () => {
      const results = searcher.search({ query: "TypeScript" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBe(0.5);
      expect(results[0].matchReason).toContain('キーワード一致: "TypeScript"');
    });

    it("should return empty array when no query is provided", () => {
      const results = searcher.search({});
      expect(results).toEqual([]);
    });

    it("should propagate limit to search", () => {
      // seed has 3 notes, limit to 1
      const results = searcher.search({ query: "TypeScript", limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("searchByTag", () => {
    it("should return empty (tags not implemented via query)", () => {
      const results = searcher.searchByTag("typescript");
      expect(results).toEqual([]);
    });
  });

  describe("searchRecent", () => {
    it("should return empty (no query provided)", () => {
      const results = searcher.searchRecent();
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
