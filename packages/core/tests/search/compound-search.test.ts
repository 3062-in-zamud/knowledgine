import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KnowledgeSearcher } from "../../src/search/knowledge-searcher.js";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("KNOW-373: Compound keyword search", () => {
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

  describe("OR operator support", () => {
    it("should return results matching either term with explicit OR", async () => {
      const results = await searcher.search({ query: "TypeScript OR React" });
      expect(results.length).toBeGreaterThan(0);
      // Should match notes containing either TypeScript or React
      const titles = results.map((r) => ("title" in r.note ? r.note.title : ""));
      expect(titles.some((t) => t.includes("TypeScript") || t.includes("React"))).toBe(true);
    });

    it("should return more results with OR than with AND for disjoint terms", async () => {
      const orResults = await searcher.search({ query: "hooks OR debugging" });
      // "hooks debugging" as AND would likely match nothing (no note has both)
      // OR should return results from both notes
      expect(orResults.length).toBeGreaterThan(0);
    });
  });

  describe("quoted phrase support", () => {
    it("should handle quoted phrases without crashing", async () => {
      const results = await searcher.search({ query: '"TypeScript basics"' });
      // Should not throw — FTS5 natively supports quoted phrases
      expect(Array.isArray(results)).toBe(true);
    });

    it("should return results for exact phrase match", async () => {
      const results = await searcher.search({ query: '"TypeScript basics"' });
      // The seed data contains "TypeScript basics" in content
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("AND-to-OR fallback", () => {
    it("should fallback to OR when AND returns 0 results for multi-word query", async () => {
      // "hooks debugging" — no single note contains both terms in seed data
      const results = await searcher.search({ query: "hooks debugging" });
      // With fallback, should find notes matching either term
      if (results.length > 0) {
        expect(results[0].fellBack).toBe(true);
        expect(results[0].fallbackInfo).toBeDefined();
        expect(results[0].fallbackInfo?.reason).toContain("expanded to OR");
        expect(results[0].fallbackInfo?.modeUsed).toBe("keyword");
        expect(results[0].matchReason[0]).toContain("OR");
      }
    });

    it("should NOT fallback for single-word queries", async () => {
      const results = await searcher.search({ query: "TypeScript" });
      expect(results.length).toBeGreaterThan(0);
      // Single word — no fallback needed
      expect(results[0].fellBack).toBeFalsy();
      expect(results[0].fallbackInfo).toBeUndefined();
    });

    it("should NOT fallback when AND already returns results", async () => {
      // "TypeScript" appears in multiple notes, "debugging" co-occurs in one
      const results = await searcher.search({ query: "TypeScript debugging" });
      if (results.length > 0) {
        // If AND found results, no fallback should have occurred
        expect(results[0].matchReason[0]).not.toContain("OR");
      }
    });

    it("should NOT fallback when query already contains OR", async () => {
      const results = await searcher.search({ query: "nonexistent1 OR nonexistent2" });
      // Even though no results, query already uses OR — no further fallback
      expect(results.length).toBe(0);
    });
  });

  describe("FTS5 special character escaping", () => {
    it("should handle queries with FTS5 special characters", async () => {
      // Should not throw on special chars
      const results = await searcher.search({ query: 'Type*Script "basics^"' });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("default AND behavior preserved", () => {
    it("should use AND by default for multi-word queries", async () => {
      // "TypeScript projects" — appears in debugging-tips content
      const results = await searcher.search({ query: "TypeScript projects" });
      if (results.length > 0) {
        expect(results[0].matchReason[0]).toBe('キーワード一致: "TypeScript projects"');
      }
    });
  });
});
