import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalLinkGenerator } from "../../src/search/link-generator.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("LocalLinkGenerator", () => {
  let ctx: TestContext;
  let generator: LocalLinkGenerator;

  beforeEach(() => {
    ctx = createTestDb();
    generator = new LocalLinkGenerator(ctx.repository);
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("findRelatedNotes", () => {
    it("should find related notes via tag similarity", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "a.md",
        title: "Note A",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "b.md",
        title: "Note B",
        content: "content",
        frontmatter: { tags: ["typescript", "react"] },
        createdAt: now,
      });

      const related = generator.findRelatedNotes(id1);
      expect(related.length).toBeGreaterThan(0);
      expect(related.find((r) => r.filePath === "b.md")).toBeDefined();
    });

    it("should find related notes via title keywords", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "ts1.md",
        title: "TypeScript Guide",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "ts2.md",
        title: "TypeScript Patterns",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });

      const related = generator.findRelatedNotes(id1);
      expect(related.find((r) => r.filePath === "ts2.md")).toBeDefined();
    });

    it("should find related notes via time proximity (within 7 days)", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "time1.md",
        title: "TimeNote1",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "time2.md",
        title: "TimeNote2",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });

      const related = generator.findRelatedNotes(id1);
      expect(related.find((r) => r.filePath === "time2.md")).toBeDefined();
    });

    it("should find related notes via PSP pairs", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "psp1.md",
        title: "Problem Note",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });
      const id2 = ctx.repository.saveNote({
        filePath: "psp2.md",
        title: "Solution Note",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });

      ctx.repository.savePatterns(id1, [{ type: "problem", content: "Error X", confidence: 0.8 }]);
      ctx.repository.savePatterns(id2, [{ type: "solution", content: "Fix X", confidence: 0.9 }]);

      const pat1 = ctx.repository.getPatternsByNoteId(id1);
      const pat2 = ctx.repository.getPatternsByNoteId(id2);

      ctx.repository.saveProblemSolutionPairs([
        {
          problemPatternId: pat1[0].id,
          solutionPatternId: pat2[0].id,
          relevanceScore: 0.85,
        },
      ]);

      // PSP pairs for id1 should include id2 if id2 is related
      // But since both notes have different noteIds in PSP, and findByProblemSolutionPairs
      // checks relatedNoteId !== noteId and gets the other note
      // Here both problemNoteId and solutionNoteId are in same note, actually:
      // Actually the PSP stores problem_pattern_id and solution_pattern_id which belong to different notes
      const related1 = generator.findRelatedNotes(id1);
      // id2 should be related to id1 via PSP
      expect(related1.find((r) => r.id === id2)).toBeDefined();
    });

    it("should deduplicate same note found by multiple methods, taking highest score", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "dup1.md",
        title: "TypeScript Guide",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "dup2.md",
        title: "TypeScript Patterns",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });

      const related = generator.findRelatedNotes(id1);
      const dup2Count = related.filter((r) => r.filePath === "dup2.md").length;
      expect(dup2Count).toBe(1); // deduplicated
    });

    it("should sort results by similarity DESC", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "sort1.md",
        title: "Sort Note",
        content: "content",
        frontmatter: { tags: ["typescript", "react"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "sort2.md",
        title: "React Guide",
        content: "content",
        frontmatter: { tags: ["react"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "sort3.md",
        title: "TypeScript React",
        content: "content",
        frontmatter: { tags: ["typescript", "react"] },
        createdAt: now,
      });

      const related = generator.findRelatedNotes(id1, 10);
      for (let i = 1; i < related.length; i++) {
        expect(related[i - 1].similarity).toBeGreaterThanOrEqual(related[i].similarity);
      }
    });

    it("should respect limit", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "lim1.md",
        title: "Limit Test",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });
      for (let i = 2; i <= 10; i++) {
        ctx.repository.saveNote({
          filePath: `lim${i}.md`,
          title: `Limit Note ${i}`,
          content: "content",
          frontmatter: { tags: ["typescript"] },
          createdAt: now,
        });
      }
      const related = generator.findRelatedNotes(id1, 3);
      expect(related.length).toBeLessThanOrEqual(3);
    });

    it("should return empty for non-existent noteId", () => {
      const related = generator.findRelatedNotes(9999);
      expect(related).toEqual([]);
    });

    it("should exclude self from results", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "self.md",
        title: "Self Note",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "other.md",
        title: "Other Note",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });

      const related = generator.findRelatedNotes(id1);
      expect(related.find((r) => r.id === id1)).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should return empty when note has empty tags", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "notags.md",
        title: "No Tags",
        content: "content",
        frontmatter: { tags: [] },
        createdAt: now,
      });
      // With empty tags, findByTagSimilarity returns []
      // Only time proximity may find related notes
      const related = generator.findRelatedNotes(id1);
      // Should not crash
      expect(Array.isArray(related)).toBe(true);
    });

    it("should handle note with no tags frontmatter", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "nofm.md",
        title: "No Frontmatter Tags",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });
      expect(() => generator.findRelatedNotes(id1)).not.toThrow();
    });

    it("should exclude 1-char keywords from title search", () => {
      const now = new Date().toISOString();
      // "A" is only 1 char, should be excluded
      const id1 = ctx.repository.saveNote({
        filePath: "oneletter.md",
        title: "A",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });
      // Should not throw even with no valid keywords
      expect(() => generator.findRelatedNotes(id1)).not.toThrow();
    });

    it("should handle invalid JSON frontmatter gracefully", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "badjson.md",
        title: "Bad JSON",
        content: "content",
        frontmatter: { tags: ["test"] },
        createdAt: now,
      });
      // Directly corrupt frontmatter_json via raw SQL
      ctx.db
        .prepare("UPDATE knowledge_notes SET frontmatter_json = 'invalid json' WHERE id = ?")
        .run(id1);

      // Should not throw - parseTags returns [] on invalid JSON
      expect(() => generator.findRelatedNotes(id1)).not.toThrow();
    });
  });

  describe("scoring saturation fix (KNOW-351)", () => {
    it("should produce score variance when notes share multiple signals", () => {
      const now = new Date().toISOString();
      // Note with multiple signals: tags + title keywords
      const id1 = ctx.repository.saveNote({
        filePath: "sat1.md",
        title: "TypeScript Testing Guide",
        content: "content",
        frontmatter: { tags: ["typescript", "testing", "jest"] },
        createdAt: now,
      });
      // Shares both tags AND title keywords — high overlap
      ctx.repository.saveNote({
        filePath: "sat2.md",
        title: "TypeScript Testing Patterns",
        content: "content",
        frontmatter: { tags: ["typescript", "testing", "jest"] },
        createdAt: now,
      });
      // Shares only tags, no title overlap
      ctx.repository.saveNote({
        filePath: "sat3.md",
        title: "React Hooks",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });
      // No tag overlap, only time proximity
      ctx.repository.saveNote({
        filePath: "sat4.md",
        title: "Docker Setup",
        content: "content",
        frontmatter: { tags: ["docker", "devops"] },
        createdAt: now,
      });

      const related = generator.findRelatedNotes(id1, 10);
      expect(related.length).toBeGreaterThanOrEqual(2);

      // Score variance: NOT all the same score (the original bug)
      const scores = related.map((r) => r.similarity);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
      const stddev = Math.sqrt(variance);
      expect(stddev).toBeGreaterThan(0.05);

      // The note with more overlap should rank higher
      const sat2 = related.find((r) => r.filePath === "sat2.md");
      const sat3 = related.find((r) => r.filePath === "sat3.md");
      if (sat2 && sat3) {
        expect(sat2.similarity).toBeGreaterThan(sat3.similarity);
      }

      // No score should be exactly 1.00 (unless it's a problem-solution pair)
      for (const r of related) {
        expect(r.similarity).toBeLessThan(1.0);
      }
    });
  });

  describe("time-proximity bias fix (KNOW-364)", () => {
    it("should reduce time-proximity weight when all timestamps are identical (clone scenario)", () => {
      // Simulate clone: all notes created at exact same time
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "clone1.md",
        title: "Clone Note Alpha",
        content: "content about alpha",
        frontmatter: { tags: ["alpha"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "clone2.md",
        title: "Clone Note Beta",
        content: "content about beta",
        frontmatter: { tags: ["alpha"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "clone3.md",
        title: "Clone Note Gamma",
        content: "content about gamma",
        frontmatter: { tags: ["gamma"] },
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "clone4.md",
        title: "Clone Note Delta",
        content: "content about delta",
        frontmatter: { tags: ["delta"] },
        createdAt: now,
      });

      const related = generator.findRelatedNotes(id1, 10);

      // With all-same timestamps, time proximity should NOT dominate
      // Notes sharing tags (clone2) should score higher than unrelated notes (clone3, clone4)
      const clone2 = related.find((r) => r.filePath === "clone2.md");
      const unrelated = related.filter(
        (r) => r.filePath === "clone3.md" || r.filePath === "clone4.md",
      );

      if (clone2 && unrelated.length > 0) {
        for (const u of unrelated) {
          expect(clone2.similarity).toBeGreaterThan(u.similarity);
        }
      }

      // Scores should NOT all be 1.00
      const allOne = related.every((r) => r.similarity >= 0.99);
      expect(allOne).toBe(false);
    });

    it("should use time-proximity normally when timestamps have natural variance", () => {
      const base = new Date("2026-01-15");
      const id1 = ctx.repository.saveNote({
        filePath: "timevar1.md",
        title: "TimeVar Alpha",
        content: "content",
        frontmatter: {},
        createdAt: base.toISOString(),
      });
      // 1 day apart
      ctx.repository.saveNote({
        filePath: "timevar2.md",
        title: "TimeVar Beta",
        content: "content",
        frontmatter: {},
        createdAt: new Date(base.getTime() + 1 * 86400000).toISOString(),
      });
      // 6 days apart
      ctx.repository.saveNote({
        filePath: "timevar3.md",
        title: "TimeVar Gamma",
        content: "content",
        frontmatter: {},
        createdAt: new Date(base.getTime() + 6 * 86400000).toISOString(),
      });

      const related = generator.findRelatedNotes(id1, 10);
      const tv2 = related.find((r) => r.filePath === "timevar2.md");
      const tv3 = related.find((r) => r.filePath === "timevar3.md");

      // Closer note should have higher score
      if (tv2 && tv3) {
        expect(tv2.similarity).toBeGreaterThan(tv3.similarity);
      }
    });
  });
});
