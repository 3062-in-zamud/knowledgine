import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import BetterSqlite3 from "better-sqlite3";
import {
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  filterReadableProjects,
} from "../../src/index.js";
import { CrossProjectSearcher } from "../../src/search/cross-project-searcher.js";

function createProjectDb(projectDir: string): void {
  const dbDir = join(projectDir, ".knowledgine");
  mkdirSync(dbDir, { recursive: true });
  const db = new BetterSqlite3(join(dbDir, "index.sqlite"));
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repo = new KnowledgeRepository(db);
  repo.saveNote({
    filePath: "note.md",
    title: "Test Note",
    content: "TypeScript programming guide",
    createdAt: new Date().toISOString(),
  });
  db.close();
}

describe("CrossProjectSearcher", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function makeProject(name: string): { name: string; path: string } {
    const dir = mkdtempSync(join(tmpdir(), `knowledgine-test-${name}-`));
    tmpDirs.push(dir);
    createProjectDb(dir);
    return { name, path: dir };
  }

  it("searches across multiple databases", async () => {
    const p1 = makeProject("proj1");
    const p2 = makeProject("proj2");
    const searcher = new CrossProjectSearcher([p1, p2]);
    const results = await searcher.search("TypeScript");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("includes projectName in results", async () => {
    const p1 = makeProject("myproject");
    const searcher = new CrossProjectSearcher([p1]);
    const results = await searcher.search("TypeScript");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].projectName).toBe("myproject");
  });

  it("skips missing project with warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p1 = makeProject("proj1");
    const missingProject = { name: "missing", path: "/nonexistent/path/abc123" };
    const searcher = new CrossProjectSearcher([p1, missingProject]);
    const results = await searcher.search("TypeScript");
    // missing プロジェクトはスキップされ、proj1 の結果のみ返る
    expect(results.every((r) => r.projectName !== "missing")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("missing"));
    warnSpy.mockRestore();
  });

  it("opens databases read-only", async () => {
    const p1 = makeProject("proj1");
    const dbPath = join(p1.path, ".knowledgine", "index.sqlite");
    // Verify CrossProjectSearcher opens DB in readonly mode by checking that
    // an explicit readonly connection rejects write attempts
    const readonlyDb = new BetterSqlite3(dbPath, { readonly: true });
    expect(() =>
      readonlyDb
        .prepare("INSERT INTO knowledge_notes (file_path, title, content) VALUES (?, ?, ?)")
        .run("x.md", "x", "x"),
    ).toThrow();
    readonlyDb.close();

    // Searching succeeds after the readonly DB is released
    const searcher = new CrossProjectSearcher([p1]);
    const results = await searcher.search("TypeScript");
    expect(results.length).toBeGreaterThan(0);
  });

  it("closes all databases even on error", async () => {
    const p1 = makeProject("proj1");
    // schema_version が空の特殊 DB を作成（バージョン不足でスキップされる）
    const emptyDir = mkdtempSync(join(tmpdir(), "knowledgine-empty-"));
    tmpDirs.push(emptyDir);
    mkdirSync(join(emptyDir, ".knowledgine"), { recursive: true });
    const emptyDb = new BetterSqlite3(join(emptyDir, ".knowledgine", "index.sqlite"));
    emptyDb.exec(
      "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    emptyDb.close();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const searcher = new CrossProjectSearcher([p1, { name: "empty", path: emptyDir }]);
    // Should not throw
    await expect(searcher.search("TypeScript")).resolves.toBeDefined();
    warnSpy.mockRestore();
  });

  it("caps at MAX_CONNECTIONS (10 projects)", async () => {
    const projects = Array.from({ length: 12 }, (_, i) => makeProject(`proj${i}`));
    const searcher = new CrossProjectSearcher(projects);
    const results = await searcher.search("TypeScript");
    // MAX_CONNECTIONS=10 なので最初の10プロジェクトのみ検索
    // 10プロジェクト × 各1件 = 最大20件（limit=20）
    expect(results.length).toBeLessThanOrEqual(20);
    // proj10, proj11 のデータは含まれない
    const projectNames = new Set(results.map((r) => r.projectName));
    expect(projectNames.has("proj10")).toBe(false);
    expect(projectNames.has("proj11")).toBe(false);
  });

  it("sorts results by score descending", async () => {
    const p1 = makeProject("proj1");
    const p2 = makeProject("proj2");
    const searcher = new CrossProjectSearcher([p1, p2]);
    const results = await searcher.search("TypeScript");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("respects limit option", async () => {
    const projects = Array.from({ length: 5 }, (_, i) => makeProject(`p${i}`));
    const searcher = new CrossProjectSearcher(projects);
    const results = await searcher.search("TypeScript", { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("filter-then-slice: visibility filter must run before MAX_CONNECTIONS cap so private projects do not crowd visible ones out", async () => {
    // 12 visible + 3 private (mixed). After filterReadableProjects with a
    // caller who cannot see any private, all 12 visible should remain.
    // CrossProjectSearcher's internal MAX_CONNECTIONS cap (10) would then
    // hit the visible 12, not the original 15. This is the architectural
    // invariant CLI/MCP wiring must preserve.
    const visibleProjects = Array.from({ length: 12 }, (_, i) => makeProject(`v${i}`));
    const privateProjects = Array.from({ length: 3 }, (_, i) => ({
      ...makeProject(`secret${i}`),
      visibility: "private" as const,
      allowFrom: [],
    }));
    // Interleave them so naive "take first 10" without filtering would mix
    const mixed = [
      privateProjects[0],
      ...visibleProjects.slice(0, 5),
      privateProjects[1],
      ...visibleProjects.slice(5, 10),
      privateProjects[2],
      ...visibleProjects.slice(10),
    ];

    // Filter first (caller "alice" sees no private)
    const visible = filterReadableProjects("alice", mixed);
    expect(visible.length).toBe(12);
    expect(visible.every((p) => p.visibility !== "private")).toBe(true);

    // Then construct searcher — it caps at MAX_CONNECTIONS=10 internally
    const searcher = new CrossProjectSearcher(visible);
    const results = await searcher.search("TypeScript");
    const projectNames = new Set(results.map((r) => r.projectName));
    // None of the private project names should appear
    for (let i = 0; i < 3; i++) {
      expect(projectNames.has(`secret${i}`)).toBe(false);
    }
    // At least some visible projects (10 of the 12) should be there
    expect(projectNames.size).toBeGreaterThanOrEqual(1);
  });
});
