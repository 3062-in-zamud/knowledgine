import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("KnowledgeRepository: ID-only queries", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("getAllNoteIds()", () => {
    it("空DBで空配列を返す", () => {
      const ids = ctx.repository.getAllNoteIds();
      expect(ids).toEqual([]);
    });

    it("number[] を返す", () => {
      ctx.repository.saveNote({
        filePath: "a.md",
        title: "A",
        content: "content a",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const ids = ctx.repository.getAllNoteIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(typeof ids[0]).toBe("number");
    });

    it("getAllNotes().map(n => n.id) と一致する", () => {
      ctx.repository.saveNote({
        filePath: "a.md",
        title: "A",
        content: "content a",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      ctx.repository.saveNote({
        filePath: "b.md",
        title: "B",
        content: "content b",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const ids = ctx.repository.getAllNoteIds();
      const expected = ctx.repository.getAllNotes().map((n) => n.id);
      expect(ids).toEqual(expected);
    });
  });

  describe("getNotesWithoutEmbeddingIds()", () => {
    it("空DBで空配列を返す", () => {
      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(ids).toEqual([]);
    });

    it("number[] を返す", () => {
      ctx.repository.saveNote({
        filePath: "a.md",
        title: "A",
        content: "content a",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(typeof ids[0]).toBe("number");
    });

    it("埋め込みがないノートのIDのみを返す", () => {
      const id1 = ctx.repository.saveNote({
        filePath: "a.md",
        title: "A",
        content: "content a",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const id2 = ctx.repository.saveNote({
        filePath: "b.md",
        title: "B",
        content: "content b",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });

      // id1 に埋め込みを保存
      const fakeEmbedding = new Float32Array(4).fill(0.1);
      ctx.repository.saveEmbedding(id1, fakeEmbedding, "test-model");

      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(ids).not.toContain(id1);
      expect(ids).toContain(id2);
    });

    it("全ノートに埋め込みがある場合は空配列を返す", () => {
      const id1 = ctx.repository.saveNote({
        filePath: "a.md",
        title: "A",
        content: "content a",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });
      const fakeEmbedding = new Float32Array(4).fill(0.1);
      ctx.repository.saveEmbedding(id1, fakeEmbedding, "test-model");

      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(ids).toEqual([]);
    });
  });
});
