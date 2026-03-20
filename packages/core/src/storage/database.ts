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

  // Legacy support: load sqlite-vec synchronously if enableVec is explicitly true
  // New code should use loadSqliteVecExtension() instead
  if (options.enableVec === true) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require("sqlite-vec");
      sqliteVec.load(db);
    } catch {
      // sqlite-vec not available — graceful degradation
    }
  }

  return db;
}

/**
 * Asynchronously load the sqlite-vec extension into a database.
 * Returns true if loaded successfully, false otherwise.
 */
export async function loadSqliteVecExtension(db: Database.Database): Promise<boolean> {
  try {
    const sqliteVec = await import("sqlite-vec");
    sqliteVec.load(db);
    return true;
  } catch {
    // sqlite-vec not available — vector search will be unavailable
    return false;
  }
}
