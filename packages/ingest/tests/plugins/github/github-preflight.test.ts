import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// gh-parser モジュールをモック（github-plugin.test.ts と同様のパターン）
vi.mock("../../../src/plugins/github/gh-parser.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../src/plugins/github/gh-parser.js")>();
  return {
    ...original,
    execGh: vi.fn(),
    checkGhAuth: vi.fn(),
    checkGhVersion: vi.fn(),
    fetchRepoMeta: vi.fn(),
  };
});

import { GitHubPlugin } from "../../../src/plugins/github/index.js";
import {
  execGh,
  checkGhAuth,
  checkGhVersion,
  fetchRepoMeta,
} from "../../../src/plugins/github/gh-parser.js";

const mockedExecGh = vi.mocked(execGh);
const mockedCheckGhAuth = vi.mocked(checkGhAuth);
const mockedCheckGhVersion = vi.mocked(checkGhVersion);
const mockedFetchRepoMeta = vi.mocked(fetchRepoMeta);

const fixturesDir = join(__dirname, "../../fixtures/github");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("fetchRepoMeta (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetchRepoMeta to call through to the mocked execGh
    mockedFetchRepoMeta.mockImplementation(async (owner: string, repo: string) => {
      const json = await mockedExecGh([
        "api",
        `repos/${owner}/${repo}`,
        "--jq",
        "{has_issues,has_wiki,is_archived,default_branch}",
      ]);
      return JSON.parse(json);
    });
  });

  it("should call execGh with correct api args and return parsed RepoMeta", async () => {
    const repoMetaJson = JSON.stringify({
      has_issues: true,
      has_wiki: true,
      is_archived: false,
      default_branch: "main",
    });
    mockedExecGh.mockResolvedValue(repoMetaJson);

    const result = await fetchRepoMeta("octocat", "hello-world");

    expect(mockedExecGh).toHaveBeenCalledWith([
      "api",
      "repos/octocat/hello-world",
      "--jq",
      "{has_issues,has_wiki,is_archived,default_branch}",
    ]);
    expect(result).toEqual({
      has_issues: true,
      has_wiki: true,
      is_archived: false,
      default_branch: "main",
    });
  });

  it("should propagate execGh errors to the caller", async () => {
    mockedExecGh.mockRejectedValue(new Error("gh failed"));

    await expect(fetchRepoMeta("octocat", "hello-world")).rejects.toThrow("gh failed");
  });
});

describe("GitHubPlugin preflight check (has_issues)", () => {
  let plugin: GitHubPlugin;

  beforeEach(() => {
    plugin = new GitHubPlugin();
    vi.clearAllMocks();
    mockedCheckGhVersion.mockResolvedValue({ ok: true, version: "2.45.0" });
    mockedCheckGhAuth.mockResolvedValue(true);
  });

  describe("ingestAll", () => {
    it("should skip issue loop when has_issues is false", async () => {
      mockedFetchRepoMeta.mockResolvedValue({
        has_issues: false,
        has_wiki: true,
        is_archived: false,
        default_branch: "main",
      });

      const prFixture = loadFixture("prs.json");
      const emptyDetail = '{"comments":[],"reviews":[]}';
      const emptyReviewComments = "[]";

      // PR フェッチのみ（Issue フェッチは呼ばれない）
      mockedExecGh
        .mockResolvedValueOnce(prFixture)
        .mockResolvedValueOnce(emptyDetail) // PR #1 detail
        .mockResolvedValueOnce(emptyReviewComments) // PR #1 inline review comments
        .mockResolvedValueOnce(emptyDetail) // PR #2 detail
        .mockResolvedValueOnce(emptyReviewComments); // PR #2 inline review comments

      const events = [];
      for await (const event of plugin.ingestAll("github://encode/httpx")) {
        events.push(event);
      }

      // 2 PRs のみ（Issue なし）
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.eventType === "discussion")).toBe(true);
      // Issue 関連イベントが含まれていないことを確認
      expect(events.every((e) => !e.sourceUri.includes("/issues/"))).toBe(true);
    });

    it("should fetch issues normally when has_issues is true", async () => {
      mockedFetchRepoMeta.mockResolvedValue({
        has_issues: true,
        has_wiki: true,
        is_archived: false,
        default_branch: "main",
      });

      const prFixture = loadFixture("prs.json");
      const issueFixture = loadFixture("issues.json");
      const emptyDetail = '{"comments":[],"reviews":[]}';
      const emptyReviewComments = "[]";

      mockedExecGh
        .mockResolvedValueOnce(prFixture)
        .mockResolvedValueOnce(emptyDetail) // PR #1 detail
        .mockResolvedValueOnce(emptyReviewComments) // PR #1 inline review comments
        .mockResolvedValueOnce(emptyDetail) // PR #2 detail
        .mockResolvedValueOnce(emptyReviewComments) // PR #2 inline review comments
        .mockResolvedValueOnce(issueFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      // 2 PRs + 1 issue = 3 events
      expect(events).toHaveLength(3);
      const issueEvents = events.filter((e) => e.sourceUri.includes("/issues/"));
      expect(issueEvents).toHaveLength(1);
    });

    it("should fall back to normal flow (fetch issues) when fetchRepoMeta throws", async () => {
      mockedFetchRepoMeta.mockRejectedValue(new Error("network error"));

      const prFixture = loadFixture("prs.json");
      const issueFixture = loadFixture("issues.json");
      const emptyDetail = '{"comments":[],"reviews":[]}';
      const emptyReviewComments = "[]";

      mockedExecGh
        .mockResolvedValueOnce(prFixture)
        .mockResolvedValueOnce(emptyDetail) // PR #1 detail
        .mockResolvedValueOnce(emptyReviewComments) // PR #1 inline review comments
        .mockResolvedValueOnce(emptyDetail) // PR #2 detail
        .mockResolvedValueOnce(emptyReviewComments) // PR #2 inline review comments
        .mockResolvedValueOnce(issueFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      // fetchRepoMeta が失敗しても PR も Issue も取得される
      expect(events).toHaveLength(3);
    });
  });

  describe("ingestIncremental", () => {
    it("should skip issue loop when has_issues is false", async () => {
      mockedFetchRepoMeta.mockResolvedValue({
        has_issues: false,
        has_wiki: true,
        is_archived: false,
        default_branch: "main",
      });

      const prFixture = loadFixture("prs.json");
      // Issue フェッチは呼ばれないので PR のみモック
      mockedExecGh.mockResolvedValueOnce(prFixture);

      const events = [];
      for await (const event of plugin.ingestIncremental(
        "github://encode/httpx",
        "2025-01-01T00:00:00Z",
      )) {
        events.push(event);
      }

      // PR のみ（Issue なし）
      expect(events).toHaveLength(2);
      expect(events.every((e) => !e.sourceUri.includes("/issues/"))).toBe(true);
    });

    it("should fetch issues normally when has_issues is true", async () => {
      mockedFetchRepoMeta.mockResolvedValue({
        has_issues: true,
        has_wiki: true,
        is_archived: false,
        default_branch: "main",
      });

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

      expect(events).toHaveLength(3); // 2 PRs + 1 issue
    });

    it("should fall back to normal flow (fetch issues) when fetchRepoMeta throws", async () => {
      mockedFetchRepoMeta.mockRejectedValue(new Error("network error"));

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

      // fetchRepoMeta が失敗しても PR も Issue も取得される
      expect(events).toHaveLength(3);
    });
  });
});
