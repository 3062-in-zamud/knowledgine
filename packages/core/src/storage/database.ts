import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { DatabaseError } from "../errors.js";

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

  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/MODULE_NOT_FOUND|DLOPEN|NODE_MODULE_VERSION|NAPI/i.test(msg)) {
      throw new DatabaseError(
        `initialization - Native module error detected.\n\n` +
          `Resolution:\n` +
          `  1. npm rebuild better-sqlite3\n` +
          `  2. Or: rm -rf node_modules && npm install\n` +
          `  3. Current Node.js: ${process.version}`,
        error,
        { dbPath },
      );
    }
    throw new DatabaseError("initialization", error, { dbPath });
  }
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
