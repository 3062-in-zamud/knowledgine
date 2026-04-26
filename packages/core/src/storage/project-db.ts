import { join, resolve as resolvePath, sep } from "path";
import { existsSync } from "fs";
import Database from "better-sqlite3";

export type ProjectDbMode = "readSource" | "writeCopy" | "writeLink";

export interface ProjectEntry {
  name: string;
  path: string;
  /** "public" (default) or "private". Private projects are read/transfer-gated by VisibilityGate. */
  visibility?: "private" | "public";
  /** Caller `selfName`s allowed to read or transfer-from this project when visibility is "private". */
  allowFrom?: string[];
}

export interface ProjectDbHandle {
  db: Database.Database;
  schemaVersion: number;
  /** Absolute path to the opened SQLite file. */
  path: string;
}

export type OpenProjectDbError =
  | { kind: "missing_path"; expectedDbPath: string }
  | { kind: "invalid_schema_version"; path: string; cause?: unknown }
  | {
      kind: "version_too_low";
      path: string;
      version: number;
      floor: number;
      mode: ProjectDbMode;
    }
  | { kind: "path_traversal"; suppliedPath: string; resolvedDbPath: string };

export type OpenProjectDbResult =
  | { ok: true; db: Database.Database; schemaVersion: number; path: string }
  | { ok: false; error: OpenProjectDbError };

export const PROJECT_DB_FLOORS: Record<ProjectDbMode, number> = {
  // schema_version >= 8 came from migration 008 (knowledge_versioning).
  readSource: 8,
  // INT8 mirror in note_embeddings_vec was guaranteed by migration 021.
  writeCopy: 21,
  // cross_project_links is added by migration 022.
  writeLink: 22,
};

interface ResolvedDbPaths {
  projectRoot: string;
  dbPath: string;
}

/**
 * Build the absolute, canonical paths for a project root and its
 * `.knowledgine/index.sqlite`. Returns null when the supplied path
 * resolves to a database location that is *not* inside the supplied
 * project root — that can only happen when callers bypass
 * `resolveProjectArgs` and pass an unnormalized string with `..`
 * segments. Resolving up front also stops `existsSync` from falling
 * through to the process CWD when a relative path is supplied.
 */
function resolveDbPaths(projectPath: string): ResolvedDbPaths | null {
  const projectRoot = resolvePath(projectPath);
  const dbPath = resolvePath(projectRoot, ".knowledgine", "index.sqlite");
  if (!dbPath.startsWith(projectRoot + sep)) {
    return null;
  }
  return { projectRoot, dbPath };
}

// Kept as a tiny shim so external callers that imported dbPathFor in tests
// continue to work; new code should call resolveDbPaths instead.
function dbPathFor(projectPath: string): string {
  return join(resolvePath(projectPath), ".knowledgine", "index.sqlite");
}

function readSchemaVersion(db: Database.Database): number | null {
  try {
    const row = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as
      | { version: number | null }
      | undefined;
    return row?.version ?? 0;
  } catch {
    return null;
  }
}

/**
 * Open a project's `.knowledgine/index.sqlite` with a mode-branched
 * minimum schema version. Connection management (open/close) and version
 * gating are centralized here so the cross-project searcher and the
 * transfer/link services share the same leak-safe behavior.
 *
 * The function returns a discriminated result rather than throwing so the
 * caller controls logging — the cross-project searcher emits the existing
 * `console.warn` wording (see `cross-project-searcher.ts`), the transfer
 * CLI converts errors into actionable messages with remediation hints.
 */
export function openProjectDb(
  project: ProjectEntry,
  opts: { mode: ProjectDbMode },
): OpenProjectDbResult {
  const resolved = resolveDbPaths(project.path);
  if (!resolved) {
    return {
      ok: false,
      error: {
        kind: "path_traversal",
        suppliedPath: project.path,
        resolvedDbPath: dbPathFor(project.path),
      },
    };
  }
  const { dbPath: path } = resolved;

  if (!existsSync(path)) {
    return { ok: false, error: { kind: "missing_path", expectedDbPath: path } };
  }

  const readonly = opts.mode === "readSource";
  let db: Database.Database;
  try {
    db = new Database(path, { readonly });
  } catch (cause) {
    return { ok: false, error: { kind: "invalid_schema_version", path, cause } };
  }

  const version = readSchemaVersion(db);
  if (version === null) {
    db.close();
    return { ok: false, error: { kind: "invalid_schema_version", path } };
  }

  const floor = PROJECT_DB_FLOORS[opts.mode];
  if (version < floor) {
    db.close();
    return {
      ok: false,
      error: { kind: "version_too_low", path, version, floor, mode: opts.mode },
    };
  }

  return { ok: true, db, schemaVersion: version, path };
}

/**
 * Format an OpenProjectDbError into a remediation-friendly string. Used by
 * write-mode callers (transfer / link CLI commands) which prefer to throw
 * with a clear next step rather than silently skip.
 */
export function describeOpenProjectDbError(
  project: ProjectEntry,
  error: OpenProjectDbError,
): string {
  switch (error.kind) {
    case "missing_path":
      return `project "${project.name}" has no .knowledgine database at ${error.expectedDbPath}`;
    case "invalid_schema_version":
      return `project "${project.name}" at ${error.path} has no readable schema_version`;
    case "version_too_low":
      return (
        `project "${project.name}" at ${error.path} requires schema_version >= ${error.floor} ` +
        `for mode "${error.mode}" (current: ${error.version}); ` +
        `run 'knowledgine migrate --path <path>' on that project first`
      );
    case "path_traversal":
      return (
        `project "${project.name}" rejected: path "${error.suppliedPath}" ` +
        `resolves outside its own root (got dbPath ${error.resolvedDbPath})`
      );
  }
}
