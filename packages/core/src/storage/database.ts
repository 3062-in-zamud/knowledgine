import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

export interface CreateDatabaseOptions {
  enableVec?: boolean;
}

export function createDatabase(
  dbPath: string,
  options: CreateDatabaseOptions = {},
): Database.Database {
  // Ensure directory exists (skip for :memory:)
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Load sqlite-vec extension before migrations
  if (options.enableVec !== false) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require("sqlite-vec");
      sqliteVec.load(db);
    } catch {
      // sqlite-vec not available — graceful degradation
      // Vector search will be unavailable but keyword search still works
    }
  }

  return db;
}
