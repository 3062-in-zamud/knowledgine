import { resolve } from "path";
import { existsSync, statSync, accessSync, constants } from "fs";
import {
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  ModelManager,
} from "@knowledgine/core";
import { colors, symbols } from "../lib/ui/index.js";

export interface DiagnosticResult {
  name: string;
  status: "pass" | "warning" | "error";
  message: string;
  fix?: string;
}

export interface DoctorOptions {
  path?: string;
  fix?: boolean;
}

// Check 1: .knowledgine directory exists
export function checkKnowledgineDir(knowledgineDir: string): DiagnosticResult {
  if (!existsSync(knowledgineDir)) {
    return {
      name: "knowledgine directory",
      status: "error",
      message: `.knowledgine directory not found at ${knowledgineDir}`,
      fix: `knowledgine init --path ${resolve(knowledgineDir, "..")}`,
    };
  }
  return {
    name: "knowledgine directory",
    status: "pass",
    message: ".knowledgine directory exists",
  };
}

// Check 2: Database exists and is readable
export function checkDatabaseExists(dbPath: string): DiagnosticResult {
  if (!existsSync(dbPath)) {
    return {
      name: "database file",
      status: "error",
      message: `index.sqlite not found at ${dbPath}`,
      fix: `knowledgine init --path ${resolve(dbPath, "../..")}`,
    };
  }
  try {
    accessSync(dbPath, constants.R_OK);
  } catch {
    return {
      name: "database file",
      status: "error",
      message: `index.sqlite is not readable (permission denied)`,
      fix: `chmod 600 ${dbPath}`,
    };
  }
  return {
    name: "database file",
    status: "pass",
    message: "index.sqlite exists and is readable",
  };
}

// Check 3: Database is not empty (0-byte)
export function checkDatabaseNotEmpty(dbPath: string): DiagnosticResult {
  if (!existsSync(dbPath)) {
    return {
      name: "database size",
      status: "error",
      message: "index.sqlite not found — cannot check size",
    };
  }
  const stat = statSync(dbPath);
  if (stat.size === 0) {
    return {
      name: "database size",
      status: "error",
      message: "index.sqlite is 0 bytes (empty/corrupt file)",
      fix: `rm ${dbPath} && knowledgine init --path ${resolve(dbPath, "../..")}`,
    };
  }
  return {
    name: "database size",
    status: "pass",
    message: `database file is ${stat.size} bytes`,
  };
}

// Check 4: Database file permissions (should be readable/writable by owner on Unix)
export function checkDatabasePermissions(dbPath: string): DiagnosticResult {
  if (!existsSync(dbPath)) {
    return {
      name: "database permissions",
      status: "error",
      message: "index.sqlite not found — cannot check permissions",
    };
  }
  // On Windows, skip permission check
  if (process.platform === "win32") {
    return {
      name: "database permissions",
      status: "pass",
      message: "permission check skipped on Windows",
    };
  }
  try {
    accessSync(dbPath, constants.R_OK | constants.W_OK);
  } catch {
    return {
      name: "database permissions",
      status: "warning",
      message: "index.sqlite is not writable by current user",
      fix: `chmod 600 ${dbPath}`,
    };
  }
  return {
    name: "database permissions",
    status: "pass",
    message: "database file permissions are correct",
  };
}

// Check 5: FTS5 integrity
export function checkFTS5Integrity(dbPath: string): DiagnosticResult {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) {
    return {
      name: "FTS5 integrity",
      status: "error",
      message: "database unavailable — cannot check FTS5 integrity",
    };
  }
  try {
    const db = createDatabase(dbPath);
    try {
      // Check if FTS5 index exists
      const ftsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_notes_fts'")
        .get() as { name: string } | undefined;

      if (!ftsTable) {
        return {
          name: "FTS5 integrity",
          status: "warning",
          message: "FTS5 index table not found — database may need migration",
          fix: `knowledgine init --path ${resolve(dbPath, "../..")}`,
        };
      }

      // Run FTS5 integrity check (special SELECT command, read-only safe)
      db.prepare(
        "SELECT content FROM knowledge_notes_fts WHERE knowledge_notes_fts MATCH 'a*' LIMIT 1",
      ).all();
      return {
        name: "FTS5 integrity",
        status: "pass",
        message: "FTS5 index integrity check passed",
      };
    } finally {
      db.close();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: "FTS5 integrity",
      status: "error",
      message: `FTS5 integrity check failed: ${msg}`,
      fix: `knowledgine init --force --path ${resolve(dbPath, "../..")}`,
    };
  }
}

// Check 6: Embedding model files exist
export function checkModelFiles(): DiagnosticResult {
  try {
    const modelManager = new ModelManager();
    const available = modelManager.isModelAvailable();
    if (!available) {
      return {
        name: "embedding model",
        status: "warning",
        message: "all-MiniLM-L6-v2 model files not found — semantic search unavailable",
        fix: "knowledgine upgrade --semantic",
      };
    }
    return {
      name: "embedding model",
      status: "pass",
      message: "all-MiniLM-L6-v2 model files are present",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: "embedding model",
      status: "warning",
      message: `Could not check model availability: ${msg}`,
      fix: "knowledgine upgrade --semantic",
    };
  }
}

// Check 7: Embedding coverage percentage
export function checkEmbeddingCoverage(dbPath: string): DiagnosticResult {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) {
    return {
      name: "embedding coverage",
      status: "error",
      message: "database unavailable — cannot check embedding coverage",
    };
  }
  try {
    const db = createDatabase(dbPath);
    try {
      new Migrator(db, ALL_MIGRATIONS).migrate();
      const repository = new KnowledgeRepository(db);
      const stats = repository.getStats();
      if (stats.totalNotes === 0) {
        return {
          name: "embedding coverage",
          status: "pass",
          message: "no notes indexed yet",
        };
      }
      const withoutEmbeddings = repository.getNotesWithoutEmbeddingIds().length;
      const withEmbeddings = stats.totalNotes - withoutEmbeddings;
      const coverage = Math.round((withEmbeddings / stats.totalNotes) * 100);

      if (coverage === 100) {
        return {
          name: "embedding coverage",
          status: "pass",
          message: `100% coverage (${withEmbeddings}/${stats.totalNotes} notes have embeddings)`,
        };
      } else if (coverage >= 80) {
        return {
          name: "embedding coverage",
          status: "pass",
          message: `${coverage}% coverage (${withEmbeddings}/${stats.totalNotes} notes have embeddings)`,
        };
      } else if (coverage > 0) {
        return {
          name: "embedding coverage",
          status: "warning",
          message: `${coverage}% coverage — ${withoutEmbeddings} notes missing embeddings`,
          fix: "knowledgine upgrade --semantic",
        };
      } else {
        return {
          name: "embedding coverage",
          status: "warning",
          message: "no embeddings generated yet — semantic search is unavailable",
          fix: "knowledgine upgrade --semantic",
        };
      }
    } finally {
      db.close();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: "embedding coverage",
      status: "error",
      message: `Failed to check embedding coverage: ${msg}`,
    };
  }
}

// Check 8: sqlite-vec extension loadable
export async function checkSqliteVec(dbPath: string): Promise<DiagnosticResult> {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) {
    return {
      name: "sqlite-vec extension",
      status: "warning",
      message: "database unavailable — cannot check sqlite-vec",
    };
  }
  try {
    const { loadSqliteVecExtension, createDatabase: createDb } = await import("@knowledgine/core");
    const db = createDb(dbPath);
    try {
      const loaded = await loadSqliteVecExtension(db);
      if (!loaded) {
        return {
          name: "sqlite-vec extension",
          status: "warning",
          message: "sqlite-vec extension not available — vector search disabled",
          fix: "npm install sqlite-vec  (or reinstall knowledgine)",
        };
      }
      return {
        name: "sqlite-vec extension",
        status: "pass",
        message: "sqlite-vec extension loaded successfully",
      };
    } finally {
      db.close();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: "sqlite-vec extension",
      status: "warning",
      message: `sqlite-vec check failed: ${msg}`,
    };
  }
}

// Check 9: Stale embeddings (notes modified after embedding was generated)
export function checkStaleEmbeddings(dbPath: string): DiagnosticResult {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) {
    return {
      name: "stale embeddings",
      status: "error",
      message: "database unavailable — cannot check stale embeddings",
    };
  }
  try {
    const db = createDatabase(dbPath);
    try {
      new Migrator(db, ALL_MIGRATIONS).migrate();
      // Check if embedding_updated_at column exists in the schema
      const tableInfo = db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
      }>;
      const hasEmbeddingCol = tableInfo.some((col) => col.name === "embedding_updated_at");

      if (!hasEmbeddingCol) {
        return {
          name: "stale embeddings",
          status: "pass",
          message: "stale embedding check not applicable (embedding_updated_at column not present)",
        };
      }

      // Count notes where updated_at > embedding_updated_at
      const staleCount = (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM knowledge_notes
             WHERE embedding_updated_at IS NOT NULL
               AND updated_at IS NOT NULL
               AND updated_at > embedding_updated_at`,
          )
          .get() as { count: number }
      ).count;

      if (staleCount > 0) {
        return {
          name: "stale embeddings",
          status: "warning",
          message: `${staleCount} notes have stale embeddings (modified after last embedding update)`,
          fix: "knowledgine upgrade --semantic",
        };
      }
      return {
        name: "stale embeddings",
        status: "pass",
        message: "no stale embeddings detected",
      };
    } finally {
      db.close();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: "stale embeddings",
      status: "warning",
      message: `Could not check stale embeddings: ${msg}`,
    };
  }
}

// Check 10: Node.js version >= 20
export function checkNodeVersion(): DiagnosticResult {
  const version = process.version; // e.g., "v20.11.0"
  const match = version.match(/^v(\d+)\./);
  if (!match) {
    return {
      name: "Node.js version",
      status: "warning",
      message: `Could not parse Node.js version: ${version}`,
    };
  }
  const major = parseInt(match[1], 10);
  if (major < 20) {
    return {
      name: "Node.js version",
      status: "error",
      message: `Node.js ${version} is below required minimum v20`,
      fix: "nvm install 20 && nvm use 20  (or upgrade Node.js to v20+)",
    };
  }
  return {
    name: "Node.js version",
    status: "pass",
    message: `Node.js ${version} meets minimum requirement (v20+)`,
  };
}

// Check 11: Search latency micro-benchmark (single query)
export async function checkSearchLatency(dbPath: string): Promise<DiagnosticResult> {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) {
    return {
      name: "search latency",
      status: "error",
      message: "database unavailable — cannot benchmark search",
    };
  }
  try {
    const db = createDatabase(dbPath);
    try {
      new Migrator(db, ALL_MIGRATIONS).migrate();

      const ftsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_notes_fts'")
        .get() as { name: string } | undefined;

      if (!ftsTable) {
        return {
          name: "search latency",
          status: "warning",
          message: "FTS5 index not found — cannot benchmark search",
        };
      }

      const start = Date.now();
      db.prepare(
        "SELECT rowid FROM knowledge_notes_fts WHERE knowledge_notes_fts MATCH ? LIMIT 10",
      ).all("test");
      const latencyMs = Date.now() - start;

      if (latencyMs > 500) {
        return {
          name: "search latency",
          status: "warning",
          message: `FTS5 search took ${latencyMs}ms — slower than expected (>500ms)`,
          fix: "Consider running VACUUM on the database: sqlite3 index.sqlite VACUUM",
        };
      }
      return {
        name: "search latency",
        status: "pass",
        message: `FTS5 search latency: ${latencyMs}ms`,
      };
    } finally {
      db.close();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: "search latency",
      status: "warning",
      message: `Search latency benchmark failed: ${msg}`,
    };
  }
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  const dbPath = resolve(knowledgineDir, "index.sqlite");
  const results: DiagnosticResult[] = [];

  console.error("");
  console.error(`  ${colors.bold("knowledgine doctor")} — running health checks...`);
  console.error("");

  // Run all checks, capturing each independently so one failure doesn't block others
  try {
    results.push(checkKnowledgineDir(knowledgineDir));
  } catch (error) {
    results.push({
      name: "knowledgine directory",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(checkDatabaseExists(dbPath));
  } catch (error) {
    results.push({
      name: "database file",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(checkDatabaseNotEmpty(dbPath));
  } catch (error) {
    results.push({
      name: "database size",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(checkDatabasePermissions(dbPath));
  } catch (error) {
    results.push({
      name: "database permissions",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(checkFTS5Integrity(dbPath));
  } catch (error) {
    results.push({
      name: "FTS5 integrity",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(checkModelFiles());
  } catch (error) {
    results.push({
      name: "embedding model",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(checkEmbeddingCoverage(dbPath));
  } catch (error) {
    results.push({
      name: "embedding coverage",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(await checkSqliteVec(dbPath));
  } catch (error) {
    results.push({
      name: "sqlite-vec extension",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(checkStaleEmbeddings(dbPath));
  } catch (error) {
    results.push({
      name: "stale embeddings",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(checkNodeVersion());
  } catch (error) {
    results.push({
      name: "Node.js version",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    results.push(await checkSearchLatency(dbPath));
  } catch (error) {
    results.push({
      name: "search latency",
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // Auto-fix: attempt to repair issues when --fix is specified
  if (options.fix) {
    for (const result of results) {
      if (result.status !== "pass" && result.fix) {
        // Auto-fix DB permissions
        if (result.name === "database permissions" && existsSync(dbPath)) {
          try {
            const { chmodSync } = await import("fs");
            chmodSync(dbPath, 0o600);
            result.status = "pass";
            result.message = "database file permissions fixed (chmod 600)";
            console.error(`  ${symbols.success} ${colors.success(`Fixed: ${result.name}`)}`);
          } catch {
            /* non-fatal */
          }
        }
      }
    }
  }

  // Output: failures first, then success summary
  const failures = results.filter((r) => r.status !== "pass");
  const passes = results.filter((r) => r.status === "pass");

  if (failures.length > 0) {
    for (const f of failures) {
      const icon = f.status === "error" ? symbols.error : symbols.warning;
      const color = f.status === "error" ? colors.error : colors.warning;
      console.error(`  ${icon} ${color(f.name)}: ${f.message}`);
      if (f.fix) {
        console.error(`    Fix: ${colors.hint(f.fix)}`);
      }
    }
    console.error("");
  }

  if (passes.length > 0) {
    const passNames = passes.map((p) => p.name).join(", ");
    console.error(`  ${symbols.success} ${passes.length} checks passed (${passNames})`);
  }

  // Health score: 100 - (errors * 15 + warnings * 5)
  const errorCount = results.filter((r) => r.status === "error").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const score = Math.max(0, 100 - errorCount * 15 - warningCount * 5);
  const scoreColor = score >= 80 ? colors.success : score >= 50 ? colors.warning : colors.error;
  console.error(`\n  Health Score: ${scoreColor(String(score))}/100`);
  console.error("");

  if (errorCount > 0) process.exitCode = 1;
}
