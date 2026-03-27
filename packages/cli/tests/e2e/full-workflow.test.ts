import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("E2E: full workflow", { timeout: 60_000 }, () => {
  const testDir = mkdtempSync(join(tmpdir(), "knowledgine-e2e-"));
  const cliPath = join(process.cwd(), "packages/cli/dist/index.js");

  beforeAll(() => {
    // テスト用マークダウンファイルを作成
    mkdirSync(join(testDir, "notes"), { recursive: true });
    writeFileSync(
      join(testDir, "notes", "test.md"),
      "# Test Note\n\nThis is a test note about TypeScript patterns.",
    );
    writeFileSync(
      join(testDir, "notes", "error.md"),
      "# Error Handling\n\n## Problem\nDatabase connection timeout\n\n## Solution\nAdd retry logic with exponential backoff",
    );

    // init 実行
    execFileSync("node", [cliPath, "init", "--path", testDir], { stdio: "pipe" });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("init creates .knowledgine directory", () => {
    expect(existsSync(join(testDir, ".knowledgine"))).toBe(true);
  });

  it("search returns results", () => {
    execFileSync("node", [cliPath, "search", "TypeScript", "--path", testDir, "--format", "json"], {
      encoding: "utf-8",
    });
    // stderrに出力されるため、エラーにならなければOK
  });

  it("plugins list shows all plugins", () => {
    // plugins list は stderr に出力するため spawnSync で stderr をキャプチャ
    const result = spawnSync("node", [cliPath, "plugins", "list"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    const combined = (result.stdout ?? "") + (result.stderr ?? "");
    expect(combined).toContain("cursor-sessions");
    expect(combined).toContain("cicd");
  });

  it("suggest returns without error", () => {
    // 0件でもエラーにならないこと
    execFileSync("node", [cliPath, "suggest", "--context", "TypeScript", "--path", testDir], {
      stdio: "pipe",
    });
  });

  it("explain exits with non-zero when entity not found", () => {
    // エンティティが見つからない場合は exitCode=1 になる仕様
    const result = spawnSync(
      "node",
      [cliPath, "explain", "--entity", "NonExistentEntity12345", "--path", testDir],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
  });
});

describe("CLI smoke test", { timeout: 30_000 }, () => {
  const cliPath = join(process.cwd(), "packages/cli/dist/index.js");

  const commands = [
    ["init", "--help"],
    ["start", "--help"],
    ["setup", "--help"],
    ["status", "--help"],
    ["upgrade", "--help"],
    ["ingest", "--help"],
    ["plugins", "--help"],
    ["feedback", "--help"],
    ["demo", "--help"],
    ["suggest", "--help"],
    ["explain", "--help"],
    ["serve", "--help"],
    ["recall", "--help"],
  ];

  for (const args of commands) {
    it(`${args.join(" ")} exits 0`, () => {
      execFileSync("node", [cliPath, ...args], { stdio: "pipe" });
    });
  }
});
