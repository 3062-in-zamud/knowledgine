import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import BetterSqlite3 from "better-sqlite3";
import { Migrator, ALL_MIGRATIONS } from "../../src/index.js";
import { openProjectDb, PROJECT_DB_FLOORS } from "../../src/storage/project-db.js";

function createMigratedProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "knowledgine-projectdb-"));
  mkdirSync(join(dir, ".knowledgine"), { recursive: true });
  const db = new BetterSqlite3(join(dir, ".knowledgine", "index.sqlite"));
  new Migrator(db, ALL_MIGRATIONS).migrate();
  db.close();
  return dir;
}

describe("openProjectDb", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function makeProject(name = "p"): { name: string; path: string } {
    const dir = createMigratedProjectDir();
    tmpDirs.push(dir);
    return { name, path: dir };
  }

  describe("floor constants", () => {
    it("readSource floor is 8 (knowledge_versioning migration)", () => {
      expect(PROJECT_DB_FLOORS.readSource).toBe(8);
    });

    it("writeCopy floor is 21 (INT8 quantization migration)", () => {
      expect(PROJECT_DB_FLOORS.writeCopy).toBe(21);
    });

    it("writeLink floor is 22 (cross_project_links migration)", () => {
      expect(PROJECT_DB_FLOORS.writeLink).toBe(22);
    });
  });

  describe("readSource mode", () => {
    it("returns ok with handle for a fully-migrated DB", () => {
      const p = makeProject();
      const r = openProjectDb(p, { mode: "readSource" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.schemaVersion).toBeGreaterThanOrEqual(PROJECT_DB_FLOORS.readSource);
        expect(r.path).toContain(".knowledgine");
        expect(r.path).toContain("index.sqlite");
        r.db.close();
      }
    });

    it("opens the database read-only (write attempts throw)", () => {
      const p = makeProject();
      const r = openProjectDb(p, { mode: "readSource" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(() =>
          r.db
            .prepare("INSERT INTO knowledge_notes (file_path, title, content) VALUES (?, ?, ?)")
            .run("x.md", "x", "x"),
        ).toThrow();
        r.db.close();
      }
    });

    it("returns error.missing_path when the .knowledgine DB does not exist", () => {
      const r = openProjectDb(
        { name: "x", path: "/nonexistent/path/abc123" },
        { mode: "readSource" },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe("missing_path");
        if (r.error.kind === "missing_path") {
          expect(r.error.expectedDbPath).toContain("nonexistent");
          expect(r.error.expectedDbPath).toContain("index.sqlite");
        }
      }
    });

    it("returns error.invalid_schema_version when schema_version table is absent", () => {
      const dir = mkdtempSync(join(tmpdir(), "knowledgine-noschema-"));
      tmpDirs.push(dir);
      mkdirSync(join(dir, ".knowledgine"), { recursive: true });
      const db = new BetterSqlite3(join(dir, ".knowledgine", "index.sqlite"));
      db.exec("CREATE TABLE foo(x);");
      db.close();

      const r = openProjectDb({ name: "broken", path: dir }, { mode: "readSource" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe("invalid_schema_version");
      }
    });

    it("normalizes the project path and resolves a relative input into an absolute db path", () => {
      const p = makeProject();
      // simulate a caller that bypassed resolveProjectArgs and passed a
      // path with redundant "../" segments — resolve() must canonicalize
      // before existsSync runs.
      const messy = `${p.path}/foo/..`;
      const r = openProjectDb({ name: p.name, path: messy }, { mode: "readSource" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.path).toContain(".knowledgine");
        expect(r.path).not.toContain("..");
        r.db.close();
      }
    });

    it("returns error.version_too_low when schema version is below the floor", () => {
      const dir = mkdtempSync(join(tmpdir(), "knowledgine-old-"));
      tmpDirs.push(dir);
      mkdirSync(join(dir, ".knowledgine"), { recursive: true });
      const db = new BetterSqlite3(join(dir, ".knowledgine", "index.sqlite"));
      db.exec(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); " +
          "INSERT INTO schema_version VALUES (5, 'fake', datetime('now'));",
      );
      db.close();

      const r = openProjectDb({ name: "old", path: dir }, { mode: "readSource" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe("version_too_low");
        if (r.error.kind === "version_too_low") {
          expect(r.error.version).toBe(5);
          expect(r.error.floor).toBe(8);
          expect(r.error.mode).toBe("readSource");
        }
      }
    });
  });

  describe("writeCopy mode", () => {
    it("opens the database read-write (INSERT into a probe table succeeds)", () => {
      const p = makeProject();
      const r = openProjectDb(p, { mode: "writeCopy" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        r.db.exec(
          "CREATE TABLE IF NOT EXISTS _probe(x INTEGER); INSERT INTO _probe(x) VALUES (1);",
        );
        const row = r.db.prepare("SELECT x FROM _probe LIMIT 1").get() as { x: number } | undefined;
        expect(row?.x).toBe(1);
        r.db.close();
      }
    });

    it("rejects a target whose schema is below floor 21 (e.g. version 8)", () => {
      const dir = mkdtempSync(join(tmpdir(), "knowledgine-v8-"));
      tmpDirs.push(dir);
      mkdirSync(join(dir, ".knowledgine"), { recursive: true });
      const db = new BetterSqlite3(join(dir, ".knowledgine", "index.sqlite"));
      db.exec(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); " +
          "INSERT INTO schema_version VALUES (8, 'old', datetime('now'));",
      );
      db.close();

      const r = openProjectDb({ name: "old", path: dir }, { mode: "writeCopy" });
      expect(r.ok).toBe(false);
      if (!r.ok && r.error.kind === "version_too_low") {
        expect(r.error.floor).toBe(21);
        expect(r.error.version).toBe(8);
      }
    });
  });

  describe("writeLink mode", () => {
    it("opens RW when target schema is at the floor (22)", () => {
      // Build a minimal target DB at exactly version 22 so we can verify the
      // floor without depending on migration022 being registered yet.
      const dir = mkdtempSync(join(tmpdir(), "knowledgine-v22-"));
      tmpDirs.push(dir);
      mkdirSync(join(dir, ".knowledgine"), { recursive: true });
      const db = new BetterSqlite3(join(dir, ".knowledgine", "index.sqlite"));
      db.exec(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); " +
          "INSERT INTO schema_version VALUES (22, 'fake_22', datetime('now'));",
      );
      db.close();

      const r = openProjectDb({ name: "v22", path: dir }, { mode: "writeLink" });
      expect(r.ok).toBe(true);
      if (r.ok) r.db.close();
    });

    it("rejects a target at version 21 (cross_project_links not yet present)", () => {
      // Build a v21-only DB explicitly (fresh-migrated DBs now reach v22).
      const dir = mkdtempSync(join(tmpdir(), "knowledgine-v21-"));
      tmpDirs.push(dir);
      mkdirSync(join(dir, ".knowledgine"), { recursive: true });
      const db = new BetterSqlite3(join(dir, ".knowledgine", "index.sqlite"));
      db.exec(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); " +
          "INSERT INTO schema_version VALUES (21, 'pre_22', datetime('now'));",
      );
      db.close();

      const r = openProjectDb({ name: "v21", path: dir }, { mode: "writeLink" });
      expect(r.ok).toBe(false);
      if (!r.ok && r.error.kind === "version_too_low") {
        expect(r.error.floor).toBe(22);
        expect(r.error.version).toBe(21);
      }
    });

    it("opens RW when target schema is fully migrated (current head)", () => {
      const p = makeProject();
      const r = openProjectDb(p, { mode: "writeLink" });
      expect(r.ok).toBe(true);
      if (r.ok) r.db.close();
    });
  });
});
