import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("migration004: knowledge_graph", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("should create entities table", () => {
    const result = ctx.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entities'")
      .get();
    expect(result).toBeDefined();
  });

  it("should create entities_fts virtual table", () => {
    const result = ctx.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entities_fts'")
      .get();
    expect(result).toBeDefined();
  });

  it("should create relations table", () => {
    const result = ctx.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='relations'")
      .get();
    expect(result).toBeDefined();
  });

  it("should create observations table", () => {
    const result = ctx.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations'")
      .get();
    expect(result).toBeDefined();
  });

  it("should create entity_note_links table", () => {
    const result = ctx.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entity_note_links'")
      .get();
    expect(result).toBeDefined();
  });

  it("should enforce UNIQUE constraint on entities (name, entity_type)", () => {
    const now = new Date().toISOString();
    ctx.db
      .prepare("INSERT INTO entities (name, entity_type, created_at) VALUES (?, ?, ?)")
      .run("typescript", "technology", now);

    expect(() => {
      ctx.db
        .prepare("INSERT INTO entities (name, entity_type, created_at) VALUES (?, ?, ?)")
        .run("typescript", "technology", now);
    }).toThrow();
  });

  it("should enforce UNIQUE constraint on relations (from, to, type)", () => {
    const now = new Date().toISOString();
    ctx.db
      .prepare("INSERT INTO entities (name, entity_type, created_at) VALUES (?, ?, ?)")
      .run("entity-a", "technology", now);
    ctx.db
      .prepare("INSERT INTO entities (name, entity_type, created_at) VALUES (?, ?, ?)")
      .run("entity-b", "project", now);
    const fromId = (ctx.db.prepare("SELECT id FROM entities WHERE name='entity-a'").get() as { id: number }).id;
    const toId = (ctx.db.prepare("SELECT id FROM entities WHERE name='entity-b'").get() as { id: number }).id;

    ctx.db
      .prepare("INSERT INTO relations (from_entity_id, to_entity_id, relation_type, strength, created_at) VALUES (?,?,?,?,?)")
      .run(fromId, toId, "uses", 1.0, now);

    expect(() => {
      ctx.db
        .prepare("INSERT INTO relations (from_entity_id, to_entity_id, relation_type, strength, created_at) VALUES (?,?,?,?,?)")
        .run(fromId, toId, "uses", 1.0, now);
    }).toThrow();
  });
});
