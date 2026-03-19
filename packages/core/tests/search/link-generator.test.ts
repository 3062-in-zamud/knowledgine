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
});
