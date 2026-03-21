import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { captureCommand } from "../../src/commands/capture.js";

describe("capture command", () => {
  let testDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrOutput: string[];
  let stdoutOutput: string[];
  let originalExitCode: number | undefined;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-capture-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    stderrOutput = [];
    stdoutOutput = [];
    stderrSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderrOutput.push(args.map(String).join(" "));
    });
    stdoutSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      stdoutOutput.push(args.map(String).join(" "));
    });
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    process.exitCode = originalExitCode;
    rmSync(testDir, { recursive: true, force: true });
  });

  function setupTestDb(): void {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });
    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();
    writeFileSync(join(testDir, ".knowledginerc"), JSON.stringify({ rootPath: testDir }));
  }

  describe("テキスト位置引数での取り込み", () => {
    it("テキストを直接キャプチャする", async () => {
      setupTestDb();
      await captureCommand("React Hooks の注意点", { path: testDir });

      const text = stderrOutput.join("\n");
      expect(text).toContain("Captured (id:");
      expect(text).toContain("React Hooks");
      expect(process.exitCode).toBe(0);
    });

    it("タグを指定してキャプチャする", async () => {
      setupTestDb();
      await captureCommand("React Hooks の注意点", {
        path: testDir,
        tags: "react,hooks",
      });

      const text = stderrOutput.join("\n");
      expect(text).toContain("Tags:  react, hooks");
    });

    it("タイトルを指定してキャプチャする", async () => {
      setupTestDb();
      await captureCommand("長い内容テキスト", {
        path: testDir,
        title: "カスタムタイトル",
      });

      const text = stderrOutput.join("\n");
      expect(text).toContain("Title: カスタムタイトル");
    });
  });

  describe("--file での取り込み", () => {
    it("ファイルからキャプチャする", async () => {
      setupTestDb();
      const filePath = join(testDir, "test-note.md");
      writeFileSync(filePath, "# テストノート\n\nこれはテストです。");

      await captureCommand(undefined, { path: testDir, file: filePath });

      const text = stderrOutput.join("\n");
      expect(text).toContain("Captured (id:");
      expect(text).toContain("Source: file (manual)");
    });

    it("存在しないファイルでエラー", async () => {
      setupTestDb();
      await captureCommand(undefined, { path: testDir, file: "/nonexistent/file.md" });

      expect(process.exitCode).toBe(1);
      const text = stderrOutput.join("\n");
      expect(text).toContain("File not found");
    });
  });

  describe("--format json 出力", () => {
    it("JSON形式で出力する", async () => {
      setupTestDb();
      await captureCommand("テスト内容", { path: testDir, format: "json" });

      const json = JSON.parse(stdoutOutput.join(""));
      expect(json.ok).toBe(true);
      expect(json.command).toBe("capture");
      expect(json.result.id).toBeGreaterThan(0);
      expect(json.result.title).toBeDefined();
    });
  });

  describe("エラーケース", () => {
    it("未初期化DBでエラー", async () => {
      await captureCommand("テスト", { path: testDir });

      expect(process.exitCode).toBe(1);
      const text = stderrOutput.join("\n");
      expect(text).toContain("Knowledge base not initialized");
    });

    it("入力なしでエラー", async () => {
      setupTestDb();
      // process.stdin.isTTY=true をシミュレート
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

      await captureCommand(undefined, { path: testDir });

      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });

      expect(process.exitCode).toBe(1);
      const text = stderrOutput.join("\n");
      expect(text).toContain("No input provided");
    });
  });

  describe("SSRF対策", () => {
    it("localhost URL を拒否する", async () => {
      setupTestDb();
      await captureCommand(undefined, { path: testDir, url: "http://localhost/secret" });

      expect(process.exitCode).toBe(1);
      const text = stderrOutput.join("\n");
      expect(text).toContain("Local addresses are not allowed");
    });

    it("プライベートIP URL を拒否する", async () => {
      setupTestDb();
      await captureCommand(undefined, { path: testDir, url: "http://192.168.1.1/api" });

      expect(process.exitCode).toBe(1);
      const text = stderrOutput.join("\n");
      expect(text).toContain("Private network addresses are not allowed");
    });
  });

  describe("--url での取り込み", () => {
    it("URLからコンテンツをフェッチしてキャプチャする", async () => {
      setupTestDb();

      // fetch をモック
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "Fetched content from URL",
        status: 200,
        statusText: "OK",
      }) as unknown as typeof fetch;

      await captureCommand(undefined, {
        path: testDir,
        url: "https://example.com/article",
      });

      globalThis.fetch = originalFetch;

      const text = stderrOutput.join("\n");
      expect(text).toContain("Captured (id:");
      expect(text).toContain("Source: url (manual)");
      expect(process.exitCode).toBe(0);
    });

    it("fetch失敗時にエラー", async () => {
      setupTestDb();

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }) as unknown as typeof fetch;

      await captureCommand(undefined, {
        path: testDir,
        url: "https://example.com/missing",
      });

      globalThis.fetch = originalFetch;

      expect(process.exitCode).toBe(1);
      const text = stderrOutput.join("\n");
      expect(text).toContain("Failed to fetch URL");
    });
  });
});
