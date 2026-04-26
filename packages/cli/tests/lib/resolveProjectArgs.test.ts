import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ProjectEntry } from "@knowledgine/core";
import { resolveProjectArgs } from "../../src/lib/resolve-project-args.js";

function makeProjectDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `knowledgine-rpa-${label}-`));
  mkdirSync(join(dir, ".knowledgine"), { recursive: true });
  writeFileSync(join(dir, ".knowledgine", "index.sqlite"), "");
  return dir;
}

function makePlainDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `knowledgine-rpa-plain-${label}-`));
}

describe("resolveProjectArgs", () => {
  let cleanup: string[];

  beforeEach(() => {
    cleanup = [];
  });

  afterEach(() => {
    for (const d of cleanup) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function track<T extends string>(d: T): T {
    cleanup.push(d);
    return d;
  }

  // 1: registered name → ProjectEntry 解決（回帰）
  it("resolves registered name from rc config", () => {
    const projDir = track(makeProjectDir("reg1"));
    const rc: ProjectEntry[] = [{ name: "my-repo", path: projDir }];
    const result = resolveProjectArgs("my-repo", rc);
    expect(result.resolved).toEqual([{ name: "my-repo", path: projDir }]);
    expect(result.unresolvedNames).toEqual([]);
    expect(result.unresolvedPaths).toEqual([]);
    expect(result.truncatedCount).toBe(0);
  });

  // 2: 絶対 path + .knowledgine 存在 → resolved
  it("resolves absolute path with .knowledgine to ProjectEntry whose name is basename", () => {
    const projDir = track(makeProjectDir("abs1"));
    const result = resolveProjectArgs(projDir, []);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].path).toBe(projDir);
    // basename は mkdtempSync が生成した最終セグメント
    expect(result.resolved[0].name).toBe(projDir.split("/").pop());
    expect(result.unresolvedPaths).toEqual([]);
  });

  // 3: 相対 path → cwd で resolve
  it("resolves relative path against options.cwd", () => {
    const baseDir = track(mkdtempSync(join(tmpdir(), "knowledgine-rpa-cwd-")));
    const projDirName = "myproj";
    const projDir = join(baseDir, projDirName);
    mkdirSync(join(projDir, ".knowledgine"), { recursive: true });
    writeFileSync(join(projDir, ".knowledgine", "index.sqlite"), "");

    const result = resolveProjectArgs(`./${projDirName}`, [], { cwd: baseDir });
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].path).toBe(projDir);
    expect(result.resolved[0].name).toBe(projDirName);
  });

  // 4: ~/foo → homedir expand
  it("expands tilde to options.homeDir", () => {
    const fakeHome = track(mkdtempSync(join(tmpdir(), "knowledgine-rpa-home-")));
    const projDirName = "homeproj";
    const projDir = join(fakeHome, projDirName);
    mkdirSync(join(projDir, ".knowledgine"), { recursive: true });
    writeFileSync(join(projDir, ".knowledgine", "index.sqlite"), "");

    const result = resolveProjectArgs(`~/${projDirName}`, [], {
      cwd: "/tmp",
      homeDir: fakeHome,
    });
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].path).toBe(projDir);
    expect(result.resolved[0].name).toBe(projDirName);
  });

  // 5: registered + path 混在 CSV → 両方解決
  it("resolves mixed CSV of registered name and absolute path", () => {
    const regDir = track(makeProjectDir("mix-reg"));
    const pathDir = track(makeProjectDir("mix-path"));
    const rc: ProjectEntry[] = [{ name: "registered", path: regDir }];
    const result = resolveProjectArgs(`registered,${pathDir}`, rc);
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved.find((p) => p.name === "registered")?.path).toBe(regDir);
    expect(result.resolved.find((p) => p.path === pathDir)).toBeDefined();
  });

  // 6: 同文字列が registered と path 両方該当 → path 優先
  it("prefers path resolution when arg is path-like even if same name registered", () => {
    const projDir = track(makeProjectDir("prio"));
    const rc: ProjectEntry[] = [{ name: projDir, path: "/some/other/path" }];
    const result = resolveProjectArgs(projDir, rc);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].path).toBe(projDir);
    // path 解決優先のため、rc の `/some/other/path` は使われない
    expect(result.resolved[0].path).not.toBe("/some/other/path");
  });

  // 7: 解決不能 path → unresolvedPaths
  it("collects path-like args without .knowledgine into unresolvedPaths", () => {
    const plainDir = track(makePlainDir("noindex"));
    const result = resolveProjectArgs(plainDir, []);
    expect(result.resolved).toEqual([]);
    expect(result.unresolvedPaths).toEqual([plainDir]);
    expect(result.unresolvedNames).toEqual([]);
  });

  // 8: 解決不能 name → unresolvedNames（rc=null + name のみ）
  it("collects unknown registered names into unresolvedNames when rc empty", () => {
    const result = resolveProjectArgs("foo,bar", []);
    expect(result.resolved).toEqual([]);
    expect(result.unresolvedNames).toEqual(["foo", "bar"]);
    expect(result.unresolvedPaths).toEqual([]);
  });

  // 9: 空白除外（既存の whitespace-tolerant 挙動）
  it("ignores empty / whitespace-only entries while keeping valid ones", () => {
    const projDir = track(makeProjectDir("ws"));
    const rc: ProjectEntry[] = [{ name: "my-repo", path: projDir }];
    const result = resolveProjectArgs(",, ,my-repo", rc);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].name).toBe("my-repo");
  });

  // 10: trailing slash 正規化（path.resolve 後 basename）
  it("normalizes trailing slash and uses basename", () => {
    const projDir = track(makeProjectDir("ts"));
    const result = resolveProjectArgs(`${projDir}/`, []);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].name).toBe(projDir.split("/").pop());
    expect(result.resolved[0].path).toBe(projDir);
  });

  // 11: 同一 path の CSV 重複 → dedupe
  it("dedupes identical resolved paths", () => {
    const projDir = track(makeProjectDir("dup"));
    const result = resolveProjectArgs(`${projDir},${projDir}`, []);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].path).toBe(projDir);
  });

  // 11b: 同一 registered name の CSV 重複 → dedupe
  it("dedupes repeated registered names", () => {
    const projDir = track(makeProjectDir("regdup"));
    const rc: ProjectEntry[] = [{ name: "my-repo", path: projDir }];
    const result = resolveProjectArgs("my-repo,my-repo,my-repo", rc);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].name).toBe("my-repo");
  });

  // 11c: registered name と同じ実体を指す絶対 path 混在 → dedupe
  it("dedupes registered name and absolute path pointing to the same dir", () => {
    const projDir = track(makeProjectDir("samedir"));
    const rc: ProjectEntry[] = [{ name: "alias", path: projDir }];
    const result = resolveProjectArgs(`alias,${projDir}`, rc);
    expect(result.resolved).toHaveLength(1);
  });

  // 12: MAX_CONNECTIONS=10 超過
  it("truncates beyond MAX_CONNECTIONS=10 and reports truncatedCount", () => {
    const dirs = Array.from({ length: 11 }, (_, i) => track(makeProjectDir(`max${i}`)));
    const csv = dirs.join(",");
    const result = resolveProjectArgs(csv, []);
    expect(result.resolved).toHaveLength(10);
    expect(result.truncatedCount).toBe(1);
  });

  // 13: Windows separator 形式 → path-like 判定
  it("treats Windows-style relative paths as path-like", () => {
    const result = resolveProjectArgs("..\\sibling", []);
    // path-like と判定されるが解決失敗 → unresolvedPaths
    expect(result.unresolvedPaths).toEqual(["..\\sibling"]);
    expect(result.unresolvedNames).toEqual([]);
    expect(result.resolved).toEqual([]);
  });

  // 14: basename が空（"/"）→ fallback で path 全体を name に
  it("falls back to full path when basename is empty (POSIX root)", () => {
    // root には .knowledgine があり得ないので unresolvedPaths に入る
    const result = resolveProjectArgs("/", []);
    expect(result.resolved).toEqual([]);
    expect(result.unresolvedPaths).toEqual(["/"]);
  });

  // 15: シンボリックリンクは path.resolve のみで実体解決しない
  it("does not realpath symlinks; resolved.path is the link path", () => {
    const realDir = track(makeProjectDir("symreal"));
    const linkBase = track(mkdtempSync(join(tmpdir(), "knowledgine-rpa-sym-")));
    const linkPath = join(linkBase, "link");
    symlinkSync(realDir, linkPath);
    const result = resolveProjectArgs(linkPath, []);
    expect(result.resolved).toHaveLength(1);
    // symlink 経由でも .knowledgine/index.sqlite は existsSync で見える
    // path フィールドは link path のまま（realpath 解決されない）
    expect(result.resolved[0].path).toBe(linkPath);
  });

  // 16: 空文字 / "," のみ → Case D 検出可能（unresolvedNames=[], unresolvedPaths=[]）
  it("returns all-empty result for whitespace-only or comma-only input", () => {
    expect(resolveProjectArgs("", [])).toMatchObject({
      resolved: [],
      unresolvedNames: [],
      unresolvedPaths: [],
      truncatedCount: 0,
    });
    expect(resolveProjectArgs(",", [])).toMatchObject({
      resolved: [],
      unresolvedNames: [],
      unresolvedPaths: [],
    });
    expect(resolveProjectArgs("   ", [])).toMatchObject({
      resolved: [],
      unresolvedNames: [],
      unresolvedPaths: [],
    });
  });

  // 17: ~user/... → other-user expand 不対応
  it("does not expand ~user (other-user) tilde", () => {
    const result = resolveProjectArgs("~someoneelse/foo", [], {
      cwd: "/tmp",
      homeDir: "/Users/me",
    });
    // ~someoneelse は path-like 判定にならない（regex は ~/ または ~\\ または ~ 単体のみ）
    // ので registered name として扱われ、rc 不在で unresolvedNames に入る
    expect(result.resolved).toEqual([]);
    expect(result.unresolvedNames).toEqual(["~someoneelse/foo"]);
    expect(result.unresolvedPaths).toEqual([]);
  });

  // 18: 名前マッチで visibility/allowFrom を carry する
  it("carries visibility + allowFrom from rc when matched by name", () => {
    const dir = track(makeProjectDir("vname"));
    const rc: ProjectEntry[] = [
      { name: "secret", path: dir, visibility: "private", allowFrom: ["webapp"] },
    ];
    const result = resolveProjectArgs("secret", rc);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].visibility).toBe("private");
    expect(result.resolved[0].allowFrom).toEqual(["webapp"]);
  });

  // 19: パス引数でも rc に登録された path に一致すれば visibility/allowFrom を carry
  it("carries visibility + allowFrom from rc when matched by absolute path", () => {
    const dir = track(makeProjectDir("vpath"));
    const rc: ProjectEntry[] = [
      { name: "secret", path: dir, visibility: "private", allowFrom: ["webapp"] },
    ];
    const result = resolveProjectArgs(dir, rc);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].name).toBe("secret"); // rc name wins, not basename
    expect(result.resolved[0].visibility).toBe("private");
    expect(result.resolved[0].allowFrom).toEqual(["webapp"]);
  });

  // 20: rc に未登録のパス → metadata なし（従来通り basename）
  it("falls back to basename + no visibility metadata when path is not in rc", () => {
    const dir = track(makeProjectDir("voffrc"));
    const result = resolveProjectArgs(dir, []);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].visibility).toBeUndefined();
    expect(result.resolved[0].allowFrom).toBeUndefined();
  });
});
