import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { ValidationError, KnowledgeNotFoundError } from "../../src/errors.js";
import type { TestContext } from "../helpers/test-db.js";

describe("KnowledgeRepository", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("saveNote", () => {
    it("should insert a new note and return id", () => {
      const id = ctx.repository.saveNote({
        filePath: "test.md",
        title: "Test",
        content: "Content here",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      expect(typeof id).toBe("number");
      expect(id).toBeGreaterThan(0);
    });

    it("should return same id when updating existing note", () => {
      const id1 = ctx.repository.saveNote({
        filePath: "test.md",
        title: "Test",
        content: "Initial content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const id2 = ctx.repository.saveNote({
        filePath: "test.md",
        title: "Test Updated",
        content: "Updated content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      expect(id1).toBe(id2);
    });

    it("should skip update when content hash is same", () => {
      const data = {
        filePath: "test.md",
        title: "Test",
        content: "Identical content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      };
      const id1 = ctx.repository.saveNote(data);
      const id2 = ctx.repository.saveNote(data);
      expect(id1).toBe(id2);
    });

    it("should store null frontmatter_json when frontmatter is empty", () => {
      const id = ctx.repository.saveNote({
        filePath: "test.md",
        title: "Test",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const note = ctx.repository.getNoteById(id);
      expect(note?.frontmatter_json).toBeNull();
    });
  });

  describe("ValidationError", () => {
    it("should throw ValidationError for empty filePath", () => {
      expect(() =>
        ctx.repository.saveNote({
          filePath: "",
          title: "Test",
          content: "Content",
          frontmatter: {},
          createdAt: new Date().toISOString(),
        }),
      ).toThrow(ValidationError);
    });

    it("should throw ValidationError for empty title", () => {
      expect(() =>
        ctx.repository.saveNote({
          filePath: "test.md",
          title: "",
          content: "Content",
          frontmatter: {},
          createdAt: new Date().toISOString(),
        }),
      ).toThrow(ValidationError);
    });

    it("should throw ValidationError for empty content", () => {
      expect(() =>
        ctx.repository.saveNote({
          filePath: "test.md",
          title: "Test",
          content: "",
          frontmatter: {},
          createdAt: new Date().toISOString(),
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("getNoteById", () => {
    it("should return note when it exists", () => {
      const id = ctx.repository.saveNote({
        filePath: "test.md",
        title: "Test Note",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const note = ctx.repository.getNoteById(id);
      expect(note).toBeDefined();
      expect(note!.title).toBe("Test Note");
    });

    it("should return undefined when note does not exist", () => {
      const note = ctx.repository.getNoteById(9999);
      expect(note).toBeUndefined();
    });
  });

  describe("getNoteByPath", () => {
    it("should return note by file path when it exists", () => {
      ctx.repository.saveNote({
        filePath: "path/test.md",
        title: "Test",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const note = ctx.repository.getNoteByPath("path/test.md");
      expect(note).toBeDefined();
      expect(note!.file_path).toBe("path/test.md");
    });

    it("should return undefined when note does not exist", () => {
      const note = ctx.repository.getNoteByPath("nonexistent.md");
      expect(note).toBeUndefined();
    });
  });

  describe("getNoteByIdOrThrow", () => {
    it("should return note when it exists", () => {
      const id = ctx.repository.saveNote({
        filePath: "test.md",
        title: "Test",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const note = ctx.repository.getNoteByIdOrThrow(id);
      expect(note.id).toBe(id);
    });

    it("should throw KnowledgeNotFoundError when note does not exist", () => {
      expect(() => ctx.repository.getNoteByIdOrThrow(9999)).toThrow(KnowledgeNotFoundError);
    });
  });

  describe("getNoteByPathOrThrow", () => {
    it("should return note when it exists", () => {
      ctx.repository.saveNote({
        filePath: "myfile.md",
        title: "Test",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const note = ctx.repository.getNoteByPathOrThrow("myfile.md");
      expect(note.file_path).toBe("myfile.md");
    });

    it("should throw KnowledgeNotFoundError when note does not exist", () => {
      expect(() => ctx.repository.getNoteByPathOrThrow("missing.md")).toThrow(
        KnowledgeNotFoundError,
      );
    });
  });

  describe("searchNotes", () => {
    it("should return notes matching FTS5 query", () => {
      ctx.repository.saveNote({
        filePath: "ts.md",
        title: "TypeScript Guide",
        content: "Learn TypeScript basics",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const results = ctx.repository.searchNotes("TypeScript");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return empty array when no matches", () => {
      const results = ctx.repository.searchNotes("xyzzyunknownterm");
      expect(results).toEqual([]);
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        ctx.repository.saveNote({
          filePath: `note${i}.md`,
          title: `Note ${i}`,
          content: "searchable content keyword",
          frontmatter: {},
          createdAt: new Date().toISOString(),
        });
      }
      const results = ctx.repository.searchNotes("searchable", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe("deleteNoteById", () => {
    it("should return true when note exists and is deleted", () => {
      const id = ctx.repository.saveNote({
        filePath: "delete-me.md",
        title: "Delete",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const result = ctx.repository.deleteNoteById(id);
      expect(result).toBe(true);
      expect(ctx.repository.getNoteById(id)).toBeUndefined();
    });

    it("should return false when note does not exist", () => {
      const result = ctx.repository.deleteNoteById(9999);
      expect(result).toBe(false);
    });
  });

  describe("deleteNoteByPath", () => {
    it("should return true when note exists and is deleted", () => {
      ctx.repository.saveNote({
        filePath: "delete-by-path.md",
        title: "Delete",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const result = ctx.repository.deleteNoteByPath("delete-by-path.md");
      expect(result).toBe(true);
    });

    it("should return false when note does not exist", () => {
      const result = ctx.repository.deleteNoteByPath("nonexistent.md");
      expect(result).toBe(false);
    });
  });

  describe("savePatterns and getPatternsByNoteId", () => {
    it("should save and retrieve patterns", () => {
      const noteId = ctx.repository.saveNote({
        filePath: "patterns.md",
        title: "Patterns",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      ctx.repository.savePatterns(noteId, [
        { type: "problem", content: "Error occurred", confidence: 0.8, lineNumber: 1 },
        { type: "solution", content: "Fixed it", confidence: 0.9, lineNumber: 5 },
      ]);
      const patterns = ctx.repository.getPatternsByNoteId(noteId);
      expect(patterns).toHaveLength(2);
      expect(patterns.find((p) => p.pattern_type === "problem")).toBeDefined();
      expect(patterns.find((p) => p.pattern_type === "solution")).toBeDefined();
    });

    it("should delete old patterns and insert new ones on re-call", () => {
      const noteId = ctx.repository.saveNote({
        filePath: "repatterns.md",
        title: "RePat",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      ctx.repository.savePatterns(noteId, [
        { type: "problem", content: "Old problem", confidence: 0.8 },
      ]);
      ctx.repository.savePatterns(noteId, [
        { type: "solution", content: "New solution", confidence: 0.9 },
      ]);
      const patterns = ctx.repository.getPatternsByNoteId(noteId);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern_type).toBe("solution");
    });
  });

  describe("getProblemSolutionPairsByNoteId", () => {
    it("should save PSP and retrieve with correct structure", () => {
      const noteId = ctx.repository.saveNote({
        filePath: "psp.md",
        title: "PSP",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      ctx.repository.savePatterns(noteId, [
        { type: "problem", content: "Error X", confidence: 0.8 },
        { type: "solution", content: "Fix X", confidence: 0.9 },
      ]);
      const patterns = ctx.repository.getPatternsByNoteId(noteId);
      const problemPattern = patterns.find((p) => p.pattern_type === "problem")!;
      const solutionPattern = patterns.find((p) => p.pattern_type === "solution")!;

      ctx.repository.saveProblemSolutionPairs([
        {
          problemPatternId: problemPattern.id,
          solutionPatternId: solutionPattern.id,
          relevanceScore: 0.85,
        },
      ]);

      const pairs = ctx.repository.getProblemSolutionPairsByNoteId(noteId);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].problemPattern).toBe("Error X");
      expect(pairs[0].solutionPattern).toBe("Fix X");
      expect(pairs[0].confidence).toBe(0.85);
    });
  });

  describe("saveNoteLinks and getNoteLinks", () => {
    it("should save and retrieve note links sorted by similarity DESC", () => {
      const id1 = ctx.repository.saveNote({
        filePath: "a.md",
        title: "A",
        content: "Content A",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const id2 = ctx.repository.saveNote({
        filePath: "b.md",
        title: "B",
        content: "Content B",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const id3 = ctx.repository.saveNote({
        filePath: "c.md",
        title: "C",
        content: "Content C",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      ctx.repository.saveNoteLinks([
        { sourceNoteId: id1, targetNoteId: id2, linkType: "related", similarity: 0.5 },
        { sourceNoteId: id1, targetNoteId: id3, linkType: "related", similarity: 0.9 },
      ]);
      const links = ctx.repository.getNoteLinks(id1);
      expect(links).toHaveLength(2);
      expect(links[0].similarity).toBe(0.9);
      expect(links[1].similarity).toBe(0.5);
    });
  });

  describe("findNotesByTagSimilarity", () => {
    it("should find notes that share tags and exclude self", () => {
      const id1 = ctx.repository.saveNote({
        filePath: "tag1.md",
        title: "Tag1",
        content: "Content",
        frontmatter: { tags: ["typescript"] },
        createdAt: new Date().toISOString(),
      });
      ctx.repository.saveNote({
        filePath: "tag2.md",
        title: "Tag2",
        content: "Content",
        frontmatter: { tags: ["typescript", "react"] },
        createdAt: new Date().toISOString(),
      });
      const results = ctx.repository.findNotesByTagSimilarity(id1, ["typescript"], 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.find((r) => r.id === id1)).toBeUndefined();
    });
  });

  describe("findNotesByTitleKeywords", () => {
    it("should find notes matching title keywords", () => {
      const id1 = ctx.repository.saveNote({
        filePath: "kw1.md",
        title: "TypeScript Patterns",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      ctx.repository.saveNote({
        filePath: "kw2.md",
        title: "TypeScript Guide",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const results = ctx.repository.findNotesByTitleKeywords(id1, ["TypeScript"], 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.find((r) => r.id === id1)).toBeUndefined();
    });
  });

  describe("findNotesByTimeProximity", () => {
    it("should find notes created within specified days", () => {
      const now = new Date().toISOString();
      const id1 = ctx.repository.saveNote({
        filePath: "time1.md",
        title: "Time1",
        content: "Content",
        frontmatter: {},
        createdAt: now,
      });
      ctx.repository.saveNote({
        filePath: "time2.md",
        title: "Time2",
        content: "Content",
        frontmatter: {},
        createdAt: now,
      });
      const results = ctx.repository.findNotesByTimeProximity(id1, now, 7, 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.find((r) => r.id === id1)).toBeUndefined();
    });
  });

  describe("getStats", () => {
    it("should return accurate counts and patternsByType", () => {
      const id1 = ctx.repository.saveNote({
        filePath: "s1.md",
        title: "S1",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const id2 = ctx.repository.saveNote({
        filePath: "s2.md",
        title: "S2",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      ctx.repository.savePatterns(id1, [
        { type: "problem", content: "Error", confidence: 0.8 },
        { type: "solution", content: "Fix", confidence: 0.9 },
      ]);
      ctx.repository.saveNoteLinks([
        { sourceNoteId: id1, targetNoteId: id2, linkType: "related", similarity: 0.7 },
      ]);

      const stats = ctx.repository.getStats();
      expect(stats.totalNotes).toBe(2);
      expect(stats.totalPatterns).toBe(2);
      expect(stats.totalLinks).toBe(1);
      expect(stats.patternsByType["problem"]).toBe(1);
      expect(stats.patternsByType["solution"]).toBe(1);
    });
  });

  describe("saveSuggestFeedback and getSuggestFeedbackForNote", () => {
    let noteId: number;

    beforeEach(() => {
      noteId = ctx.repository.saveNote({
        filePath: "feedback-test.md",
        title: "Feedback Test",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
    });

    it("should save useful feedback and return inserted id", () => {
      const id = ctx.repository.saveSuggestFeedback(noteId, "TypeScript error", true);
      expect(typeof id).toBe("number");
      expect(id).toBeGreaterThan(0);
    });

    it("should save not-useful feedback with is_useful=false", () => {
      ctx.repository.saveSuggestFeedback(noteId, "wrong query", false);
      const records = ctx.repository.getSuggestFeedbackForNote(noteId);
      expect(records).toHaveLength(1);
      expect(records[0].isUseful).toBe(false);
    });

    it("should retrieve saved feedback with correct fields", () => {
      ctx.repository.saveSuggestFeedback(noteId, "test query", true, "extra context");
      const records = ctx.repository.getSuggestFeedbackForNote(noteId);
      expect(records).toHaveLength(1);
      expect(records[0].query).toBe("test query");
      expect(records[0].isUseful).toBe(true);
      expect(records[0].context).toBe("extra context");
      expect(typeof records[0].createdAt).toBe("string");
    });

    it("should allow multiple feedback records for the same noteId", () => {
      ctx.repository.saveSuggestFeedback(noteId, "query 1", true);
      ctx.repository.saveSuggestFeedback(noteId, "query 2", false);
      ctx.repository.saveSuggestFeedback(noteId, "query 3", true);
      const records = ctx.repository.getSuggestFeedbackForNote(noteId);
      expect(records).toHaveLength(3);
    });

    it("should return records ordered by created_at DESC", () => {
      ctx.repository.saveSuggestFeedback(noteId, "first", true);
      ctx.repository.saveSuggestFeedback(noteId, "second", false);
      const records = ctx.repository.getSuggestFeedbackForNote(noteId);
      expect(records[0].query).toBe("second");
    });

    it("should store null context when not provided", () => {
      ctx.repository.saveSuggestFeedback(noteId, "no context query", true);
      const records = ctx.repository.getSuggestFeedbackForNote(noteId);
      expect(records[0].context).toBeNull();
    });
  });

  describe("deprecateNote", () => {
    let noteId: number;

    beforeEach(() => {
      noteId = ctx.repository.saveNote({
        filePath: "deprecate-test.md",
        title: "Deprecate Test",
        content: "Content to deprecate",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
    });

    it("should mark note as deprecated with reason", () => {
      ctx.repository.deprecateNote(noteId, "Superseded by newer version");
      const note = ctx.repository.getNoteById(noteId)!;
      expect(note.deprecated).toBe(1);
      expect(note.deprecation_reason).toBe("Superseded by newer version");
    });

    it("should throw KnowledgeNotFoundError for nonexistent note", () => {
      expect(() => ctx.repository.deprecateNote(99999, "reason")).toThrow(KnowledgeNotFoundError);
    });

    it("should be excluded from searchNotesWithRank by default", () => {
      ctx.repository.deprecateNote(noteId, "outdated");
      const results = ctx.repository.searchNotesWithRank("deprecate", 50, false);
      expect(results.find((r) => r.note.id === noteId)).toBeUndefined();
    });

    it("should be included in searchNotesWithRank when includeDeprecated is true", () => {
      ctx.repository.deprecateNote(noteId, "outdated");
      const results = ctx.repository.searchNotesWithRank("deprecate", 50, true);
      expect(results.find((r) => r.note.id === noteId)).toBeDefined();
    });
  });

  describe("undeprecateNote", () => {
    let noteId: number;

    beforeEach(() => {
      noteId = ctx.repository.saveNote({
        filePath: "undeprecate-test.md",
        title: "Undeprecate Test",
        content: "Content to undeprecate",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      ctx.repository.deprecateNote(noteId, "temporarily deprecated");
    });

    it("should clear deprecated flag and reason", () => {
      ctx.repository.undeprecateNote(noteId);
      const note = ctx.repository.getNoteById(noteId)!;
      expect(note.deprecated).toBe(0);
      expect(note.deprecation_reason).toBeNull();
    });

    it("should throw KnowledgeNotFoundError for nonexistent note", () => {
      expect(() => ctx.repository.undeprecateNote(99999)).toThrow(KnowledgeNotFoundError);
    });
  });

  describe("createNewVersion", () => {
    let noteId: number;

    beforeEach(() => {
      noteId = ctx.repository.saveNote({
        filePath: "version-test.md",
        title: "Version 1",
        content: "Original content",
        frontmatter: { tags: ["test"] },
        createdAt: new Date().toISOString(),
      });
    });

    it("should create a new version and deprecate the old one", () => {
      const newId = ctx.repository.createNewVersion(noteId, {
        title: "Version 2",
        content: "Updated content",
      } as Partial<import("../../src/types.js").KnowledgeData>);

      expect(newId).not.toBe(noteId);

      const oldNote = ctx.repository.getNoteById(noteId)!;
      expect(oldNote.deprecated).toBe(1);
      expect(oldNote.deprecation_reason).toContain("Superseded by version");

      const newNote = ctx.repository.getNoteById(newId)!;
      expect(newNote.title).toBe("Version 2");
      expect(newNote.content).toBe("Updated content");
      expect(newNote.supersedes).toBe(noteId);
      expect(newNote.version).toBe(2);
      expect(newNote.deprecated).toBe(0);
      expect(newNote.file_path).toBe("version-test.md#v2");
    });

    it("should preserve original fields when partial data provided", () => {
      const newId = ctx.repository.createNewVersion(noteId, {
        content: "Only content changed",
      } as Partial<import("../../src/types.js").KnowledgeData>);

      const newNote = ctx.repository.getNoteById(newId)!;
      expect(newNote.title).toBe("Version 1");
      expect(newNote.content).toBe("Only content changed");
    });

    it("should increment version from existing version", () => {
      const v2Id = ctx.repository.createNewVersion(noteId, {
        content: "v2",
      } as Partial<import("../../src/types.js").KnowledgeData>);
      const v3Id = ctx.repository.createNewVersion(v2Id, {
        content: "v3",
      } as Partial<import("../../src/types.js").KnowledgeData>);

      const v3 = ctx.repository.getNoteById(v3Id)!;
      expect(v3.version).toBe(3);
      expect(v3.supersedes).toBe(v2Id);
    });

    it("should throw KnowledgeNotFoundError for nonexistent note", () => {
      expect(() =>
        ctx.repository.createNewVersion(
          99999,
          {} as Partial<import("../../src/types.js").KnowledgeData>,
        ),
      ).toThrow(KnowledgeNotFoundError);
    });

    it("should be atomic - both deprecation and creation succeed or fail together", () => {
      const newId = ctx.repository.createNewVersion(noteId, {
        content: "new version",
      } as Partial<import("../../src/types.js").KnowledgeData>);

      // Both operations should have succeeded
      const old = ctx.repository.getNoteById(noteId)!;
      const newNote = ctx.repository.getNoteById(newId)!;
      expect(old.deprecated).toBe(1);
      expect(newNote.deprecated).toBe(0);
    });
  });

  describe("KnowledgeNote type includes version fields", () => {
    it("should include version, supersedes, and deprecation_reason fields", () => {
      const noteId = ctx.repository.saveNote({
        filePath: "type-test.md",
        title: "Type Test",
        content: "Content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const note = ctx.repository.getNoteById(noteId)!;
      expect("version" in note).toBe(true);
      expect("supersedes" in note).toBe(true);
      expect("deprecation_reason" in note).toBe(true);
    });
  });

  describe("searchByCodeLocation", () => {
    beforeEach(() => {
      const now = new Date().toISOString();
      // Insert notes with code_location_json via raw SQL (bypassing saveNote until it's extended)
      ctx.db
        .prepare(
          `INSERT INTO knowledge_notes
           (file_path, title, content, created_at, code_location_json)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          "github://owner/repo/pull/1/comments",
          "Review comment on src/auth.ts",
          "This should use const",
          now,
          JSON.stringify({ path: "src/auth.ts", line: 42, side: "RIGHT" }),
        );
      ctx.db
        .prepare(
          `INSERT INTO knowledge_notes
           (file_path, title, content, created_at, code_location_json)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          "github://owner/repo/pull/2/comments",
          "Review comment on src/utils.ts",
          "Good naming convention",
          now,
          JSON.stringify({ path: "src/utils.ts", line: 10, side: "LEFT" }),
        );
      ctx.db
        .prepare(
          `INSERT INTO knowledge_notes
           (file_path, title, content, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run("plain-note.md", "Plain note without code location", "some content", now);
    });

    it("should find notes by file path", () => {
      const results = ctx.repository.searchByCodeLocation("src/auth.ts");
      expect(results).toHaveLength(1);
      const loc = JSON.parse(results[0].code_location_json!) as { path: string };
      expect(loc.path).toBe("src/auth.ts");
    });

    it("should return empty array for nonexistent path", () => {
      const results = ctx.repository.searchByCodeLocation("nonexistent.ts");
      expect(results).toHaveLength(0);
    });

    it("should not return notes without code_location_json", () => {
      const results = ctx.repository.searchByCodeLocation("plain-note");
      expect(results).toHaveLength(0);
    });

    it("should support partial path matching", () => {
      const results = ctx.repository.searchByCodeLocation("src/");
      expect(results).toHaveLength(2);
    });
  });
});
