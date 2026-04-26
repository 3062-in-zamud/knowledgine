import { describe, it, expect, afterEach } from "vitest";
import { createDatabase, loadSqliteVecExtension } from "../../src/storage/database.js";
import type Database from "better-sqlite3";

describe("createDatabase", () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
  });

  it("should create an in-memory database", () => {
    db = createDatabase(":memory:");
    expect(db).toBeDefined();
    // In-memory databases use "memory" journal mode (WAL is set but not applicable to :memory:)
    const result = db.pragma("journal_mode") as Array<{ journal_mode: string }>;
    expect(result[0].journal_mode).toBe("memory");
  });

  it("should create database without sqlite-vec by default", () => {
    db = createDatabase(":memory:");
    // sqlite-vec tables should not be loaded unless enableVec is true
    // The database should work fine for FTS5 queries
    expect(db).toBeDefined();
  });

  it("should accept enableVec: true for backward compatibility", () => {
    // This should not throw even if sqlite-vec is available/unavailable
    db = createDatabase(":memory:", { enableVec: true });
    expect(db).toBeDefined();
  });

  it("should set synchronous=NORMAL (1) for WAL-safe durability with reduced fsync cost", () => {
    db = createDatabase(":memory:");
    const result = db.pragma("synchronous") as Array<{ synchronous: number }>;
    expect(result[0].synchronous).toBe(1);
  });

  it("should set cache_size to -20000 (20MB)", () => {
    db = createDatabase(":memory:");
    const result = db.pragma("cache_size") as Array<{ cache_size: number }>;
    expect(result[0].cache_size).toBe(-20000);
  });
});

describe("loadSqliteVecExtension", () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
  });

  it("should return boolean indicating success", async () => {
    db = createDatabase(":memory:");
    const result = await loadSqliteVecExtension(db);
    // sqlite-vec should be available in dev (it's in devDependencies)
    expect(typeof result).toBe("boolean");
  });

  it("should load sqlite-vec successfully when available", async () => {
    db = createDatabase(":memory:");
    const success = await loadSqliteVecExtension(db);
    // In the dev environment, sqlite-vec should be available
    expect(success).toBe(true);
  });

  it("should be idempotent (calling twice should not throw)", async () => {
    db = createDatabase(":memory:");
    await loadSqliteVecExtension(db);
    const secondResult = await loadSqliteVecExtension(db);
    expect(typeof secondResult).toBe("boolean");
  });
});
