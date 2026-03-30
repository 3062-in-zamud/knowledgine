import { describe, it, expect } from "vitest";
import { createDatabase, closeDatabase } from "../../src/index.js";
import { statSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("KNOW-384: Database safety", () => {
  it("creates a non-empty database file", () => {
    const dbPath = join(tmpdir(), `knowledgine-test-${Date.now()}.db`);
    const db = createDatabase(dbPath);
    closeDatabase(db);
    const stat = statSync(dbPath);
    expect(stat.size).toBeGreaterThan(0);
    // Cleanup
    try {
      unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("closeDatabase performs WAL checkpoint", () => {
    const dbPath = join(tmpdir(), `knowledgine-test-wal-${Date.now()}.db`);
    const db = createDatabase(dbPath);
    db.exec("CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO test_table VALUES (1)");
    closeDatabase(db);
    // After checkpoint, WAL file should be empty or non-existent
    const walPath = dbPath + "-wal";
    if (existsSync(walPath)) {
      const walStat = statSync(walPath);
      expect(walStat.size).toBe(0);
    }
    // Cleanup
    try {
      unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(dbPath + "-wal");
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(dbPath + "-shm");
    } catch {
      /* ignore */
    }
  });
});
