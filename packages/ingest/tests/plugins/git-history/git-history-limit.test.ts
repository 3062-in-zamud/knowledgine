import { describe, it, expect, beforeEach, vi } from "vitest";
import { GitHistoryPlugin } from "../../../src/plugins/git-history/index.js";
import * as gitParser from "../../../src/plugins/git-history/git-parser.js";

describe("GitHistoryPlugin - limit configuration", () => {
  let plugin: GitHistoryPlugin;

  beforeEach(() => {
    plugin = new GitHistoryPlugin();
  });

  describe("initialize with config", () => {
    it("should store limit from config", async () => {
      const result = await plugin.initialize({ limit: 50 });
      expect(result.ok).toBe(true);
      // limit が内部状態に保存されること（ingestAll の挙動で確認）
    });

    it("should store since from config", async () => {
      const result = await plugin.initialize({ since: "2024-01-01" });
      expect(result.ok).toBe(true);
    });

    it("should store unlimited from config", async () => {
      const result = await plugin.initialize({ unlimited: true });
      expect(result.ok).toBe(true);
    });

    it("should apply default limit=100 when no config provided", async () => {
      const result = await plugin.initialize();
      expect(result.ok).toBe(true);
      // デフォルト limit=100 が適用されることは ingestAll の git log 引数で確認
    });
  });

  describe("ingestAll with limit options", () => {
    it("should pass -N option to git log when limit is specified", async () => {
      const execGitSpy = vi.spyOn(gitParser, "execGit");

      // rev-parse --git-dir (チェック用) → 成功
      // rev-parse --abbrev-ref HEAD (ブランチ取得) → "main"
      // log (本体) → 空文字列
      execGitSpy.mockImplementation(async (args: string[]) => {
        if (args[0] === "--version") return "git version 2.0.0";
        if (args.includes("--git-dir")) return ".git";
        if (args.includes("--abbrev-ref")) return "main";
        return "";
      });

      await plugin.initialize({ limit: 50 });

      const events = [];
      for await (const event of plugin.ingestAll("/fake/repo")) {
        events.push(event);
      }

      // git log 呼び出しを確認
      const logCall = execGitSpy.mock.calls.find((call) => call[0][0] === "log");
      expect(logCall).toBeDefined();
      expect(logCall![0]).toContain("-50");

      execGitSpy.mockRestore();
    });

    it("should pass --since option to git log when since is specified", async () => {
      const execGitSpy = vi.spyOn(gitParser, "execGit");

      execGitSpy.mockImplementation(async (args: string[]) => {
        if (args[0] === "--version") return "git version 2.0.0";
        if (args.includes("--git-dir")) return ".git";
        if (args.includes("--abbrev-ref")) return "main";
        return "";
      });

      await plugin.initialize({ since: "2024-01-01" });

      const events = [];
      for await (const event of plugin.ingestAll("/fake/repo")) {
        events.push(event);
      }

      const logCall = execGitSpy.mock.calls.find((call) => call[0][0] === "log");
      expect(logCall).toBeDefined();
      expect(logCall![0]).toContain("--since=2024-01-01");

      execGitSpy.mockRestore();
    });

    it("should apply default -100 limit when no options provided", async () => {
      const execGitSpy = vi.spyOn(gitParser, "execGit");

      execGitSpy.mockImplementation(async (args: string[]) => {
        if (args[0] === "--version") return "git version 2.0.0";
        if (args.includes("--git-dir")) return ".git";
        if (args.includes("--abbrev-ref")) return "main";
        return "";
      });

      await plugin.initialize();

      const events = [];
      for await (const event of plugin.ingestAll("/fake/repo")) {
        events.push(event);
      }

      const logCall = execGitSpy.mock.calls.find((call) => call[0][0] === "log");
      expect(logCall).toBeDefined();
      expect(logCall![0]).toContain("-100");

      execGitSpy.mockRestore();
    });

    it("should not pass -N limit when unlimited=true", async () => {
      const execGitSpy = vi.spyOn(gitParser, "execGit");

      execGitSpy.mockImplementation(async (args: string[]) => {
        if (args[0] === "--version") return "git version 2.0.0";
        if (args.includes("--git-dir")) return ".git";
        if (args.includes("--abbrev-ref")) return "main";
        return "";
      });

      await plugin.initialize({ unlimited: true });

      const events = [];
      for await (const event of plugin.ingestAll("/fake/repo")) {
        events.push(event);
      }

      const logCall = execGitSpy.mock.calls.find((call) => call[0][0] === "log");
      expect(logCall).toBeDefined();
      // -N 形式の引数が含まれないこと
      const hasLimitArg = logCall![0].some((arg: string) => /^-\d+$/.test(arg));
      expect(hasLimitArg).toBe(false);

      execGitSpy.mockRestore();
    });

    it("should not pass -N limit when since is specified (since takes precedence)", async () => {
      const execGitSpy = vi.spyOn(gitParser, "execGit");

      execGitSpy.mockImplementation(async (args: string[]) => {
        if (args[0] === "--version") return "git version 2.0.0";
        if (args.includes("--git-dir")) return ".git";
        if (args.includes("--abbrev-ref")) return "main";
        return "";
      });

      await plugin.initialize({ since: "2024-06-01" });

      const events = [];
      for await (const event of plugin.ingestAll("/fake/repo")) {
        events.push(event);
      }

      const logCall = execGitSpy.mock.calls.find((call) => call[0][0] === "log");
      expect(logCall).toBeDefined();
      const hasLimitArg = logCall![0].some((arg: string) => /^-\d+$/.test(arg));
      expect(hasLimitArg).toBe(false);

      execGitSpy.mockRestore();
    });
  });
});
