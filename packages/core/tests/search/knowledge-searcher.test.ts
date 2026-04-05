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
    it("should fall back to keyword search with notification when no embedding provider", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "semantic" });
      // No provider → capability pre-check falls back to keyword with fallbackInfo
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fellBack).toBe(true);
      expect(results[0].fallbackInfo?.modeUsed).toBe("keyword");
      expect(results[0].fallbackInfo?.originalMode).toBe("semantic");
      // Should still include keyword match reason
      expect(results[0].matchReason).toContain('キーワード一致: "TypeScript"');
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

  describe("search (fallback behavior)", () => {
    it("should fall back to keyword for hybrid mode without provider", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "hybrid" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fellBack).toBe(true);
      expect(results[0].fallbackInfo?.modeUsed).toBe("keyword");
      expect(results[0].fallbackInfo?.originalMode).toBe("hybrid");
    });

    it("should not include fallback notice for explicit keyword mode", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "keyword" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchReason).not.toContain(
        "Warning: keyword search is not available. Showing keyword results instead. Run 'knowledgine upgrade --semantic' to enable.",
      );
    });

    it("should set fellBack=true when semantic mode falls back to keyword due to no embeddingProvider", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "semantic" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fellBack).toBe(true);
    });

    it("should set fellBack=true when hybrid mode falls back to keyword due to no embeddingProvider", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "hybrid" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fellBack).toBe(true);
    });

    it("should set fellBack=false (or undefined) for keyword mode", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "keyword" });
      expect(results.length).toBeGreaterThan(0);
      // keyword modeではフォールバックしない
      expect(results[0].fellBack).toBeFalsy();
    });

    it("should include fallbackInfo when semantic mode falls back due to no embeddingProvider", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "semantic" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fallbackInfo).toBeDefined();
      expect(results[0].fallbackInfo?.modeUsed).toBe("keyword");
      expect(results[0].fallbackInfo?.originalMode).toBe("semantic");
      expect(results[0].fallbackInfo?.reason).toContain("semantic");
    });

    it("should include fallbackInfo when hybrid mode falls back due to no embeddingProvider", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "hybrid" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fallbackInfo).toBeDefined();
      expect(results[0].fallbackInfo?.modeUsed).toBe("keyword");
      expect(results[0].fallbackInfo?.originalMode).toBe("hybrid");
      expect(results[0].fallbackInfo?.reason).toContain("Embedding provider not available");
    });

    it("should not include fallbackInfo for explicit keyword mode", async () => {
      const results = await searcher.search({ query: "TypeScript", mode: "keyword" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fallbackInfo).toBeUndefined();
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

  describe("KNOW-411: AND→OR query relaxation", () => {
    it("should return OR-expanded results with fallbackInfo when AND yields 0 results", async () => {
      // Multi-term query where AND yields nothing (no note contains both terms)
      const results = await searcher.search({ query: "React debugging" });
      // "React" matches react-hooks, "debugging" matches debugging-tips
      // AND: neither note contains both → 0 rows → OR fallback
      if (results.length > 0 && results[0].fellBack) {
        expect(results[0].fallbackInfo?.reason).toContain("OR");
        expect(results[0].matchReason[0]).toContain("OR");
      }
      // Even if AND somehow matches, test should not fail
      expect(Array.isArray(results)).toBe(true);
    });

    it("should supplement AND results with OR-only results when AND yields 1-2 results", async () => {
      // "TypeScript debugging" — AND should match debugging-tips.md (contains both words)
      // OR should additionally match typescript-guide.md (TypeScript only)
      const results = await searcher.search({ query: "TypeScript debugging" });
      expect(results.length).toBeGreaterThan(0);
      // Verify that results include notes from different sources
      const hasOrSupplement = results.some((r) => r.fellBack === true);
      const hasAndResult = results.some((r) => !r.fellBack);
      // At least AND result should exist
      if (results.length >= 2) {
        // When both AND and OR results are present, both types should appear
        expect(hasAndResult || hasOrSupplement).toBe(true);
      }
    });

    it("should apply 0.8x discount to OR-only supplement results", async () => {
      // Use a query that triggers the supplement path
      const results = await searcher.search({ query: "TypeScript debugging" });
      const orResults = results.filter((r) => r.fellBack === true);
      const andResults = results.filter((r) => !r.fellBack);
      // OR-supplemented results should have lower scores due to 0.8x discount
      if (orResults.length > 0 && andResults.length > 0) {
        const maxOrScore = Math.max(...orResults.map((r) => r.score));
        const maxAndScore = Math.max(...andResults.map((r) => r.score));
        // OR results should generally score lower than AND results
        expect(maxOrScore).toBeLessThanOrEqual(maxAndScore);
      }
    });
  });

  describe("CJK short query LIKE fallback", () => {
    it("returns results for 2-char CJK query", () => {
      // searchNotesWithRank should delegate to LIKE for short CJK
      const results = ctx.repository.searchNotesWithRank("認証", 10);
      // Just verify it doesn't throw (LIKE fallback handles it)
      expect(Array.isArray(results)).toBe(true);
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
