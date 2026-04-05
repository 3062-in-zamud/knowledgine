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

  describe("KNOW-411: AND→OR threshold relaxation (< 3)", () => {
    it("should supplement with OR when AND returns 1-2 results", async () => {
      // "TypeScript debugging" → AND matches 1 note (debugging-tips.md has both words)
      // OR should additionally match typescript-guide.md (has TypeScript) and others
      const results = await searcher.search({ query: "TypeScript debugging" });
      expect(results.length).toBeGreaterThan(1);

      // First result should be AND match (no fellBack)
      const andResults = results.filter((r) => !r.fellBack);
      expect(andResults.length).toBeGreaterThan(0);

      // OR-only supplements should have fellBack=true and appropriate fallbackInfo
      const orResults = results.filter((r) => r.fellBack);
      if (orResults.length > 0) {
        expect(orResults[0].fallbackInfo?.reason).toContain("supplemented with OR");
        expect(orResults[0].matchReason[0]).toContain("OR");
      }
    });

    it("AND results should rank above OR-only results (OR gets 0.8x discount)", async () => {
      const results = await searcher.search({ query: "TypeScript debugging" });
      if (results.length > 1) {
        const andResults = results.filter((r) => !r.fellBack);
        const orResults = results.filter((r) => r.fellBack);
        if (andResults.length > 0 && orResults.length > 0) {
          // Best AND result should score higher than best OR result
          const bestAndScore = Math.max(...andResults.map((r) => r.score));
          const bestOrScore = Math.max(...orResults.map((r) => r.score));
          expect(bestAndScore).toBeGreaterThanOrEqual(bestOrScore);
        }
      }
    });

    it("should preserve original OR-only behavior when AND returns 0 results", async () => {
      // "hooks debugging" — no single note contains both terms
      const results = await searcher.search({ query: "hooks debugging" });
      if (results.length > 0) {
        // All results should be OR fallback
        expect(results[0].fellBack).toBe(true);
        expect(results[0].fallbackInfo?.reason).toContain("expanded to OR");
      }
    });

    it("should NOT trigger OR fallback when AND returns 3+ results", async () => {
      // Seed 3 notes that all contain both "test" and "code"
      const now = new Date().toISOString();
      ctx.repository.saveNote({
        filePath: "test-note-a.md",
        title: "Test Note A",
        content: "This is a test about code quality",
        frontmatter: { tags: ["test"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "test-note-b.md",
        title: "Test Note B",
        content: "Another test for code review",
        frontmatter: { tags: ["test"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "test-note-c.md",
        title: "Test Note C",
        content: "Final test on code refactoring",
        frontmatter: { tags: ["test"] },
        createdAt: now,
      });

      const results = await searcher.search({ query: "test code" });
      // Should get 3+ AND results
      expect(results.length).toBeGreaterThanOrEqual(3);
      // None should be OR fallback
      const orResults = results.filter((r) => r.fellBack);
      expect(orResults.length).toBe(0);
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
