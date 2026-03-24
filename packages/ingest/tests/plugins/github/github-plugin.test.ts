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

      // 2 PRs + 1 issue = 3 events (no comments/reviews in detail)
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

      // PRs list + issues list (no PRs so no detail fetches)
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

      // empty PRs -> no detail fetches -> issues list
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

      // ingestIncremental does not fetch PR details
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
    it("should retry on rate limit error and succeed on second attempt", async () => {
      const prFixture = loadFixture("prs.json");
      const emptyFixture = loadFixture("empty.json");

      mockedExecGh
        .mockRejectedValueOnce(new Error("API rate limit exceeded"))
        .mockResolvedValueOnce(prFixture)
        // PR detail requests for 2 PRs + inline review comments for each
        .mockResolvedValueOnce('{"comments":[],"reviews":[]}')
        .mockResolvedValueOnce("[]") // PR #1 inline review comments
        .mockResolvedValueOnce('{"comments":[],"reviews":[]}')
        .mockResolvedValueOnce("[]") // PR #2 inline review comments
        .mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      expect(events).toHaveLength(2); // 2 PRs from fixture
      expect(mockedExecGh).toHaveBeenCalledTimes(7); // 1 rate limit fail + 1 success PRs + 2 PR details + 2 inline review comments + 1 issues
    }, 15_000);

    it("should not retry on non-rate-limit errors", async () => {
      mockedExecGh.mockRejectedValueOnce(new Error("network error"));

      await expect(async () => {
        for await (const _ of plugin.ingestAll("github://owner/repo")) {
          // consume
        }
      }).rejects.toThrow("network error");

      // Should only be called once (no retry)
      expect(mockedExecGh).toHaveBeenCalledTimes(1);
    });

    it("should throw after max rate limit retries exhausted", async () => {
      mockedExecGh
        .mockRejectedValueOnce(new Error("API rate limit exceeded"))
        .mockRejectedValueOnce(new Error("API rate limit exceeded"))
        .mockRejectedValueOnce(new Error("API rate limit exceeded"));

      await expect(async () => {
        for await (const _ of plugin.ingestAll("github://owner/repo")) {
          // consume
        }
      }).rejects.toThrow("rate limit");
    }, 30_000);
  });

  describe("PR detail fetching", () => {
    it("should yield comment events from PR details", async () => {
      const prFixture = loadFixture("prs.json");
      const emptyFixture = loadFixture("empty.json");
      const detailFixture = JSON.stringify({
        comments: [
          { body: "LGTM!", author: { login: "reviewer1" }, createdAt: "2025-01-03T00:00:00Z" },
        ],
        reviews: [],
      });

      mockedExecGh
        .mockResolvedValueOnce(prFixture)
        .mockResolvedValueOnce(detailFixture) // PR #1 detail
        .mockResolvedValueOnce("[]") // PR #1 inline review comments
        .mockResolvedValueOnce('{"comments":[],"reviews":[]}') // PR #2 detail
        .mockResolvedValueOnce("[]") // PR #2 inline review comments
        .mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      // 2 PRs + 1 comment = 3 events
      expect(events).toHaveLength(3);
      const commentEvent = events.find((e) => e.title.includes("Comment on PR #1"));
      expect(commentEvent).toBeDefined();
      expect(commentEvent!.eventType).toBe("discussion");
      expect(commentEvent!.metadata.author).toBe("reviewer1");
    });

    it("should yield review events from PR details", async () => {
      const prFixture = loadFixture("prs.json");
      const emptyFixture = loadFixture("empty.json");
      const detailFixture = JSON.stringify({
        comments: [],
        reviews: [
          {
            body: "Approved!",
            author: { login: "approver1" },
            state: "APPROVED",
            createdAt: "2025-01-03T00:00:00Z",
          },
        ],
      });

      mockedExecGh
        .mockResolvedValueOnce(prFixture)
        .mockResolvedValueOnce(detailFixture) // PR #1 detail
        .mockResolvedValueOnce("[]") // PR #1 inline review comments
        .mockResolvedValueOnce('{"comments":[],"reviews":[]}') // PR #2 detail
        .mockResolvedValueOnce("[]") // PR #2 inline review comments
        .mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      // 2 PRs + 1 review = 3 events
      expect(events).toHaveLength(3);
      const reviewEvent = events.find((e) => e.title.includes("Review on PR #1"));
      expect(reviewEvent).toBeDefined();
      expect(reviewEvent!.eventType).toBe("discussion");
      expect(reviewEvent!.metadata.author).toBe("approver1");
    });

    it("should continue when PR detail fetch fails", async () => {
      const prFixture = loadFixture("prs.json");
      const emptyFixture = loadFixture("empty.json");

      mockedExecGh
        .mockResolvedValueOnce(prFixture)
        .mockRejectedValueOnce(new Error("not found")) // PR #1 detail fails
        .mockResolvedValueOnce("[]") // PR #1 inline review comments (still fetched)
        .mockRejectedValueOnce(new Error("not found")) // PR #2 detail fails
        .mockResolvedValueOnce("[]") // PR #2 inline review comments (still fetched)
        .mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      // 2 PRs only (detail fetch failures are swallowed)
      expect(events).toHaveLength(2);
    });

    it("should yield inline review comment events with code location metadata", async () => {
      const prFixture = loadFixture("prs.json");
      const emptyFixture = loadFixture("empty.json");
      const reviewCommentsFixture = loadFixture("review-comments.json");

      mockedExecGh
        .mockResolvedValueOnce(prFixture)
        .mockResolvedValueOnce('{"comments":[],"reviews":[]}') // PR #1 detail
        .mockResolvedValueOnce(reviewCommentsFixture) // PR #1 inline review comments
        .mockResolvedValueOnce('{"comments":[],"reviews":[]}') // PR #2 detail
        .mockResolvedValueOnce("[]") // PR #2 inline review comments
        .mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("github://owner/repo")) {
        events.push(event);
      }

      // 2 PRs + 2 inline review comments from PR #1 fixture = 4 events
      expect(events).toHaveLength(4);
      const reviewCommentEvent = events.find(
        (e) =>
          e.metadata.extra?.type === "review_comment" &&
          e.metadata.extra?.filePath === "src/example.ts",
      );
      expect(reviewCommentEvent).toBeDefined();
      expect(reviewCommentEvent!.metadata.extra?.line).toBe(42);
      expect(reviewCommentEvent!.metadata.extra?.side).toBe("RIGHT");
    });
  });
});
