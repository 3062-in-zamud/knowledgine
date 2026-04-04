import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSqliteVecExtension } from "../../src/storage/database.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("migration003: vector_embeddings", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("should create note_embeddings table", () => {
    const result = ctx.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='note_embeddings'")
      .get();
    expect(result).toBeDefined();
  });

  it("should have correct columns in note_embeddings", () => {
    const cols = ctx.db.prepare("PRAGMA table_info(note_embeddings)").all() as Array<{
      name: string;
    }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("note_id");
    expect(colNames).toContain("embedding");
    expect(colNames).toContain("model_name");
    expect(colNames).toContain("dimensions");
    expect(colNames).toContain("created_at");
    expect(colNames).toContain("updated_at");
  });

  it("should save and retrieve embedding via repository", () => {
    const noteId = ctx.repository.saveNote({
      filePath: "test.md",
      title: "Test",
      content: "Test content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });

    const embedding = new Float32Array(384).fill(0.01);
    ctx.repository.saveEmbedding(noteId, embedding, "all-MiniLM-L6-v2");

    // Verify it was saved
    const row = ctx.db
      .prepare("SELECT note_id, model_name, dimensions FROM note_embeddings WHERE note_id = ?")
      .get(noteId) as { note_id: number; model_name: string; dimensions: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.model_name).toBe("all-MiniLM-L6-v2");
    expect(row!.dimensions).toBe(384);
  });

  it("should upsert embedding on conflict", () => {
    const noteId = ctx.repository.saveNote({
      filePath: "test2.md",
      title: "Test2",
      content: "content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });

    const emb1 = new Float32Array(384).fill(0.1);
    const emb2 = new Float32Array(384).fill(0.9);
    ctx.repository.saveEmbedding(noteId, emb1, "model-a");
    ctx.repository.saveEmbedding(noteId, emb2, "model-b");

    const row = ctx.db
      .prepare("SELECT model_name FROM note_embeddings WHERE note_id = ?")
      .get(noteId) as { model_name: string } | undefined;
    expect(row!.model_name).toBe("model-b");
  });

  it("should cascade delete embedding when note is deleted", () => {
    const noteId = ctx.repository.saveNote({
      filePath: "cascade-test.md",
      title: "Cascade",
      content: "content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    ctx.repository.saveEmbedding(noteId, new Float32Array(384), "test-model");
    ctx.repository.deleteNoteById(noteId);

    const row = ctx.db.prepare("SELECT * FROM note_embeddings WHERE note_id = ?").get(noteId);
    expect(row).toBeUndefined();
  });

  it("should return notes without embeddings", () => {
    ctx.repository.saveNote({
      filePath: "no-emb.md",
      title: "No Embedding",
      content: "content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    const notes = ctx.repository.getNotesWithoutEmbeddings();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => n.file_path === "no-emb.md")).toBe(true);
  });

  it("should report and backfill missing vector rows after sqlite-vec becomes available", async () => {
    const noteId = ctx.repository.saveNote({
      filePath: "vector-gap.md",
      title: "Vector Gap",
      content: "content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });

    ctx.repository.saveEmbedding(noteId, new Float32Array(384).fill(0.5), "test-model");

    const before = ctx.repository.getVectorIndexStats();
    expect(before.vecAvailable).toBe(false);
    expect(before.embeddingRows).toBe(1);
    expect(before.vectorRows).toBe(0);
    expect(before.missingVectorRows).toBe(1);

    await loadSqliteVecExtension(ctx.db);

    const synced = ctx.repository.syncMissingVectorsFromEmbeddings();
    expect(synced).toBe(1);

    const after = ctx.repository.getVectorIndexStats();
    expect(after.vecAvailable).toBe(true);
    expect(after.embeddingRows).toBe(1);
    expect(after.vectorRows).toBe(1);
    expect(after.missingVectorRows).toBe(0);
  });
});
