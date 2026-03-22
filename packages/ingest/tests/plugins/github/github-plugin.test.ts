import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// gh-parser モジュールをモック
vi.mock("../../../src/plugins/github/gh-parser.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../src/plugins/github/gh-parser.js")>();
  return {
    ...original,
    execGh: vi.fn(),
    checkGhAuth: vi.fn(),
    checkGhVersion: vi.fn(),
  };
});

import { GitHubPlugin } from "../../../src/plugins/github/index.js";
import { execGh, checkGhAuth, checkGhVersion } from "../../../src/plugins/github/gh-parser.js";

const mockedExecGh = vi.mocked(execGh);
const mockedCheckGhAuth = vi.mocked(checkGhAuth);
const mockedCheckGhVersion = vi.mocked(checkGhVersion);

const fixturesDir = join(__dirname, "../../fixtures/github");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("GitHubPlugin", () => {
  let plugin: GitHubPlugin;

  beforeEach(() => {
    plugin = new GitHubPlugin();
    vi.clearAllMocks();
  });

  it("should have correct manifest", () => {
    expect(plugin.manifest.id).toBe("github");
    expect(plugin.manifest.name).toBe("GitHub PRs & Issues");
    expect(plugin.manifest.version).toBe("0.1.0");
    expect(plugin.manifest.schemes).toEqual(["github://"]);
    expect(plugin.manifest.priority).toBe(1);
  });

  it("should have correct triggers", () => {
    expect(plugin.triggers).toHaveLength(2);
    expect(plugin.triggers[0]).toEqual({ type: "scheduled", cron: "0 * * * *" });
    expect(plugin.triggers[1]).toEqual({ type: "manual" });
  });

  describe("initialize", () => {
    it("should return ok when gh is authenticated and version is sufficient", async () => {
      mockedCheckGhVersion.mockResolvedValue({ ok: true, version: "2.45.0" });
      mockedCheckGhAuth.mockResolvedValue(true);

      const result = await plugin.initialize();
      expect(result.ok).toBe(true);
    });

    it("should return error when gh version check fails", async () => {
      mockedCheckGhVersion.mockResolvedValue({ ok: false, error: "gh CLI not found" });

      const result = await plugin.initialize();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("gh CLI not found");
    });

    it("should return error when gh version is too old", async () => {
      mockedCheckGhVersion.mockResolvedValue({
        ok: false,
        version: "2.30.0",
        error: "gh version 2.30.0 is too old. Minimum: 2.40.0",
      });

      const result = await plugin.initialize();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("too old");
    });

    it("should return error when gh is not authenticated", async () => {
      mockedCheckGhVersion.mockResolvedValue({ ok: true, version: "2.45.0" });
      mockedCheckGhAuth.mockResolvedValue(false);

      const result = await plugin.initialize();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not authenticated");
    });
  });

  describe("ingestAll", () => {
    it("should yield PR and issue events from fixture data", async () => {
      const prFixture = loadFixture("prs.json");
      const issueFixture = loadFixture("issues.json");

      mockedExecGh.mockResolvedValueOnce(prFixture).mockResolvedValueOnce(issueFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      // 2 PRs + 1 issue = 3 events
      expect(events).toHaveLength(3);
      expect(events[0].title).toBe("PR #1: Add feature X");
      expect(events[0].eventType).toBe("discussion");
      expect(events[1].title).toBe("PR #2: Fix bug Y");
      expect(events[2].title).toBe("Issue #10: Bug: crash on startup");
      expect(events[2].eventType).toBe("document");
    });

    it("should yield 0 events when both PRs and issues are empty", async () => {
      const emptyFixture = loadFixture("empty.json");

      mockedExecGh.mockResolvedValueOnce(emptyFixture).mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });

    it("should call execGh with correct arguments for PR list", async () => {
      const emptyFixture = loadFixture("empty.json");
      mockedExecGh.mockResolvedValueOnce(emptyFixture).mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://myorg/myrepo")) {
        events.push(event);
      }

      expect(mockedExecGh).toHaveBeenCalledTimes(2);
      const prCall = mockedExecGh.mock.calls[0][0];
      expect(prCall).toContain("pr");
      expect(prCall).toContain("-R");
      expect(prCall).toContain("myorg/myrepo");
      expect(prCall).toContain("--state");
      expect(prCall).toContain("all");
    });
  });

  describe("ingestIncremental", () => {
    it("should pass adjusted checkpoint in search query", async () => {
      const emptyFixture = loadFixture("empty.json");
      mockedExecGh.mockResolvedValueOnce(emptyFixture).mockResolvedValueOnce(emptyFixture);

      const checkpoint = "2025-01-10T12:00:00.000Z";
      const events = [];
      for await (const event of plugin.ingestIncremental("github://owner/repo", checkpoint)) {
        events.push(event);
      }

      expect(mockedExecGh).toHaveBeenCalledTimes(2);
      // checkpoint を1分前にオフセットしたものが --search に含まれる
      const prCall = mockedExecGh.mock.calls[0][0];
      expect(prCall).toContain("--search");
      const searchArg = prCall[prCall.indexOf("--search") + 1];
      expect(searchArg).toContain("updated:>=");
      expect(searchArg).toContain("2025-01-10T11:59:");
    });

    it("should yield incremental events from fixture data", async () => {
      const prFixture = loadFixture("prs.json");
      const issueFixture = loadFixture("issues.json");

      mockedExecGh.mockResolvedValueOnce(prFixture).mockResolvedValueOnce(issueFixture);

      const events = [];
      for await (const event of plugin.ingestIncremental(
        "github://owner/repo",
        "2025-01-01T00:00:00Z",
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
    });
  });

  describe("getCurrentCheckpoint", () => {
    it("should return ISO string of current time", async () => {
      const before = new Date().toISOString();
      const checkpoint = await plugin.getCurrentCheckpoint("github://owner/repo");
      const after = new Date().toISOString();

      expect(checkpoint >= before).toBe(true);
      expect(checkpoint <= after).toBe(true);
    });
  });

  describe("dispose", () => {
    it("should dispose without error", async () => {
      await expect(plugin.dispose()).resolves.toBeUndefined();
    });
  });

  describe("retry behavior", () => {
    it("should retry on execGh failure and succeed on second attempt", async () => {
      const prFixture = loadFixture("prs.json");
      const emptyFixture = loadFixture("empty.json");

      mockedExecGh
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce(prFixture)
        .mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      expect(events).toHaveLength(2); // 2 PRs from fixture
      expect(mockedExecGh).toHaveBeenCalledTimes(3); // 1 fail + 1 success for PRs + 1 success for issues
    }, 15_000);

    it("should throw after max retries exhausted", async () => {
      mockedExecGh
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockRejectedValueOnce(new Error("fail 3"));

      await expect(async () => {
        for await (const _ of plugin.ingestAll("github://owner/repo")) {
          // consume
        }
      }).rejects.toThrow("fail 3");
    }, 30_000);
  });
});
