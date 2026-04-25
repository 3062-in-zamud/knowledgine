import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  ALL_MIGRATIONS,
  Migrator,
  KnowledgeRepository,
  createDatabase,
  closeDatabase,
} from "@knowledgine/core";
import { searchCommand } from "../../src/commands/search.js";

function createProjectDb(projectDir: string, noteContent = "TypeScript programming guide"): void {
  const dbDir = join(projectDir, ".knowledgine");
  mkdirSync(dbDir, { recursive: true });
  const db = createDatabase(join(dbDir, "index.sqlite"));
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repo = new KnowledgeRepository(db);
  repo.saveNote({
    filePath: "note.md",
    title: "Test Note",
    content: noteContent,
    createdAt: new Date().toISOString(),
  });
  closeDatabase(db);
}

describe("searchCommand --projects (cross-project, KNOW-403)", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | undefined;
  let cleanup: string[];

  beforeEach(() => {
    cleanup = [];
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    vi.restoreAllMocks();
    for (const d of cleanup) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function track<T extends string>(d: T): T {
    cleanup.push(d);
    return d;
  }

  function makeProject(label: string, content = "TypeScript programming guide"): string {
    const dir = mkdtempSync(join(tmpdir(), `knowledgine-cli-${label}-`));
    track(dir);
    createProjectDb(dir, content);
    return dir;
  }

  function makeRcRoot(rcContent: object | null): string {
    const dir = mkdtempSync(join(tmpdir(), "knowledgine-cli-root-"));
    track(dir);
    if (rcContent !== null) {
      writeFileSync(join(dir, ".knowledginerc.json"), JSON.stringify(rcContent));
    }
    return dir;
  }

  // 18: dynamic path で rc 登録なし検索成功
  it("resolves --projects /abs/path without rc registration", async () => {
    const rootDir = makeRcRoot(null); // rc なし
    const projA = makeProject("dyna-a");
    const projB = makeProject("dyna-b");

    await searchCommand("TypeScript", {
      projects: `${projA},${projB}`,
      path: rootDir,
      format: "json",
    });

    expect(process.exitCode).toBeFalsy();
    const stdout = stdoutSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stdout).toContain('"crossProject":true');
    expect(stdout).toContain("TypeScript");
  });

  // 19: .knowledgine 不在の path → core/CLI warning + exitCode=0 ではなく Case A エラー
  // CLI 層で existsSync チェック済みなので unresolvedPaths に入り Case A エラーになる
  it("emits Case A error and exit 1 when path lacks .knowledgine", async () => {
    const rootDir = makeRcRoot(null);
    const plainDir = track(mkdtempSync(join(tmpdir(), "knowledgine-cli-plain-")));

    await searchCommand("anything", {
      projects: plainDir,
      path: rootDir,
    });

    expect(process.exitCode).toBe(1);
    const stderr = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stderr).toContain("No projects could be resolved");
    expect(stderr).toContain(".knowledgine/index.sqlite");
  });

  // 20a: Case B (全 name 解決不能) → exitCode=1
  it("emits Case B error when only unregistered names given", async () => {
    const rootDir = makeRcRoot({ projects: [{ name: "known", path: "/some/path" }] });

    await searchCommand("query", {
      projects: "unknown1,unknown2",
      path: rootDir,
    });

    expect(process.exitCode).toBe(1);
    const stderr = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stderr).toContain("No matching registered projects");
    expect(stderr).toContain("Available: known");
    expect(stderr).toContain("Register a project");
  });

  // 20b: Case C (混在) → exitCode=1
  it("emits Case C error when mix of unresolved names and paths", async () => {
    const rootDir = makeRcRoot(null);
    const plainDir = track(mkdtempSync(join(tmpdir(), "knowledgine-cli-mix-")));

    await searchCommand("query", {
      projects: `unknown,${plainDir}`,
      path: rootDir,
    });

    expect(process.exitCode).toBe(1);
    const stderr = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stderr).toContain("Could not resolve any projects");
    expect(stderr).toContain("Unregistered names: unknown");
    expect(stderr).toContain("Invalid paths");
  });

  // 21: registered + path 混在 → 両方検索
  it("resolves mixed registered name and dynamic path together", async () => {
    const projReg = makeProject("mix-reg");
    const projPath = makeProject("mix-path");
    const rootDir = makeRcRoot({ projects: [{ name: "regname", path: projReg }] });

    await searchCommand("TypeScript", {
      projects: `regname,${projPath}`,
      path: rootDir,
      format: "json",
    });

    expect(process.exitCode).toBeFalsy();
    const stdout = stdoutSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stdout).toContain('"crossProject":true');
    // registered と動的 path の両方の projectName が含まれる
    expect(stdout).toContain("regname");
    expect(stdout).toContain(projPath.split("/").pop());
  });

  // 22: rc=null でも動作
  it("works with no rc file when only dynamic paths given", async () => {
    const rootDir = makeRcRoot(null);
    const proj = makeProject("nullrc");

    await searchCommand("TypeScript", {
      projects: proj,
      path: rootDir,
      format: "json",
    });

    expect(process.exitCode).toBeFalsy();
    const stdout = stdoutSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stdout).toContain('"crossProject":true');
  });

  // 23: JSON 出力で projectName が basename
  it("uses basename as projectName for dynamic path in JSON output", async () => {
    const rootDir = makeRcRoot(null);
    const proj = makeProject("basename-test");
    const expectedName = proj.split("/").pop()!;

    await searchCommand("TypeScript", {
      projects: proj,
      path: rootDir,
      format: "json",
    });

    expect(process.exitCode).toBeFalsy();
    const stdout = stdoutSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const parsed = JSON.parse(stdout);
    expect(parsed.results[0].projectName).toBe(expectedName);
  });

  // 24: stdout / stderr 出力先慣習: JSON 結果 = stdout、warning = stderr
  it("writes JSON results to stdout and warnings/errors to stderr only", async () => {
    const rootDir = makeRcRoot(null);
    const proj = makeProject("stream-test");

    await searchCommand("TypeScript", {
      projects: proj,
      path: rootDir,
      format: "json",
    });

    expect(process.exitCode).toBeFalsy();
    const stdout = stdoutSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const stderr = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stdout).toContain('"ok":true');
    // stderr に JSON ペイロードが漏れていないこと
    expect(stderr).not.toContain('"ok":true');
    expect(stderr).not.toContain('"crossProject":true');
  });

  // 追加: Case D (空入力)
  it("emits Case D error for whitespace-only --projects input", async () => {
    const rootDir = makeRcRoot(null);

    await searchCommand("query", {
      projects: ",,",
      path: rootDir,
    });

    expect(process.exitCode).toBe(1);
    const stderr = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stderr).toContain("--projects requires at least one name or path");
  });

  // 追加: Case D (truly empty string from --projects "")
  it("emits Case D error when --projects is an empty string", async () => {
    const rootDir = makeRcRoot(null);

    await searchCommand("query", {
      projects: "",
      path: rootDir,
    });

    expect(process.exitCode).toBe(1);
    const stderr = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(stderr).toContain("--projects requires at least one name or path");
  });
});
