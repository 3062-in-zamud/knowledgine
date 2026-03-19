import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Migration } from "../../src/storage/migrator.js";
import { Migrator } from "../../src/storage/migrator.js";
import { migration001 } from "../../src/storage/migrations/001_initial.js";

describe("Migrator", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
  });

  it("should migrate empty database", () => {
    const migrator = new Migrator(db, [migration001]);
    migrator.migrate();

    expect(migrator.getCurrentVersion()).toBe(1);

    // Verify tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("knowledge_notes");
    expect(tableNames).toContain("extracted_patterns");
  });

  it("should skip already applied migrations", () => {
    const migrator = new Migrator(db, [migration001]);
    migrator.migrate();
    migrator.migrate(); // Second call should be a no-op

    expect(migrator.getCurrentVersion()).toBe(1);

    // Verify schema_version has only one entry
    const versions = db.prepare("SELECT * FROM schema_version").all();
    expect(versions).toHaveLength(1);
  });

  it("should rollback migrations", () => {
    const migrator = new Migrator(db, [migration001]);
    migrator.migrate();
    expect(migrator.getCurrentVersion()).toBe(1);

    migrator.rollback(0);
    expect(migrator.getCurrentVersion()).toBe(0);

    // Verify tables are dropped
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_version') AND name NOT LIKE 'sqlite_%'",
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(0);
  });

  it("should report migration status", () => {
    const migrator = new Migrator(db, [migration001]);

    // Before migration
    const beforeStatus = migrator.status();
    expect(beforeStatus).toHaveLength(1);
    expect(beforeStatus[0].applied).toBe(false);

    // After migration
    migrator.migrate();
    const afterStatus = migrator.status();
    expect(afterStatus).toHaveLength(1);
    expect(afterStatus[0].applied).toBe(true);
    expect(afterStatus[0].appliedAt).toBeDefined();
  });

  it("should handle multiple migrations in order", () => {
    const migration002: Migration = {
      version: 2,
      name: "add_test_column",
      up: (database) => {
        database.exec("ALTER TABLE knowledge_notes ADD COLUMN test_col TEXT");
      },
      down: (database) => {
        // SQLite doesn't support DROP COLUMN easily, so recreate table
        // For test purposes, just verify the migration tracking
        database.exec("SELECT 1"); // no-op for testing
      },
    };

    const migrator = new Migrator(db, [migration001, migration002]);
    migrator.migrate();

    expect(migrator.getCurrentVersion()).toBe(2);

    const status = migrator.status();
    expect(status).toHaveLength(2);
    expect(status[0].applied).toBe(true);
    expect(status[1].applied).toBe(true);
  });

  it("should rollback transaction on failure", () => {
    const failingMigration: Migration = {
      version: 2,
      name: "failing_migration",
      up: (database) => {
        database.exec("CREATE TABLE test_table (id INTEGER)");
        // This should fail - invalid SQL
        database.exec("INVALID SQL STATEMENT");
      },
      down: (database) => {
        database.exec("DROP TABLE IF EXISTS test_table");
      },
    };

    const migrator = new Migrator(db, [migration001, failingMigration]);

    // First migration should have worked before the transaction started
    // But since they run in a single transaction, both should fail
    expect(() => migrator.migrate()).toThrow();

    // Version should still be 0 since the transaction rolled back
    expect(migrator.getCurrentVersion()).toBe(0);
  });
});
