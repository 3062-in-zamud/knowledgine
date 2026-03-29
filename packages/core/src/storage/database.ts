import Database from "better-sqlite3";
import { mkdirSync, existsSync, chmodSync, statSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { DatabaseError } from "../errors.js";

function detectPackageManager(cwd: string = process.cwd()): string {
  if (process.env.VOLTA_HOME) return "volta";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

function getRebuildCommand(pm: string): string {
  switch (pm) {
    case "volta":
      return "volta run npm rebuild better-sqlite3";
    case "pnpm":
      return "pnpm rebuild better-sqlite3";
    case "yarn":
      return "yarn rebuild";
    default:
      return "npm rebuild better-sqlite3";
  }
}

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
      const pm = detectPackageManager();
      const rebuildCmd = getRebuildCommand(pm);
      throw new DatabaseError(
        `initialization - Native module error detected.\n\n` +
          `Resolution:\n` +
          `  1. ${rebuildCmd}\n` +
          `  2. Or: rm -rf node_modules && ${pm === "pnpm" ? "pnpm install" : pm === "yarn" ? "yarn install" : "npm install"}\n` +
          `  3. Current Node.js: ${process.version}`,
        error,
        { dbPath },
      );
    }
    throw new DatabaseError("initialization", error, { dbPath });
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (dbPath !== ":memory:") {
    db.pragma("mmap_size = 67108864"); // 64MB mmap
  }
  db.pragma("temp_store = MEMORY");

  // Harden file permissions (owner-only access)
  if (dbPath !== ":memory:" && process.platform !== "win32") {
    try {
      chmodSync(dbPath, 0o600);
      chmodSync(dirname(dbPath), 0o700);
    } catch {
      // Permission change may fail on some filesystems — non-fatal
    }
  }

  // Verify DB was created successfully (not a 0-byte file)
  if (dbPath !== ":memory:") {
    try {
      const stat = statSync(dbPath);
      if (stat.size === 0) {
        db.close();
        unlinkSync(dbPath);
        throw new DatabaseError("initialization - Database file is empty (0 bytes)", undefined, {
          dbPath,
        });
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      // statSync failed — non-fatal
    }
  }

  // Load sqlite-vec if requested
  let vec0Loaded = false;
  if (options.enableVec === true) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require("sqlite-vec");
      sqliteVec.load(db);
      vec0Loaded = true;
    } catch {
      // sqlite-vec not available — graceful degradation
    }
  }

  // Drop vec0-dependent triggers if vec0 is not loaded to prevent cascade errors
  if (!vec0Loaded) {
    try {
      const trigger = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='trigger' AND name='note_embeddings_ad'",
        )
        .get() as { name: string } | undefined;
      if (trigger) {
        db.exec("DROP TRIGGER IF EXISTS note_embeddings_ad");
        db.exec("DROP TRIGGER IF EXISTS note_embeddings_au");
        db.exec("DROP TRIGGER IF EXISTS note_embeddings_ai");
      }
    } catch {
      // DB may not have the table yet — ignore
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

/**
 * Safely close a database with WAL checkpoint.
 * Ensures all WAL data is written to the main database file before closing.
 */
export function closeDatabase(db: Database.Database): void {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Checkpoint may fail if DB is read-only or corrupted — non-fatal
  }
  db.close();
}
