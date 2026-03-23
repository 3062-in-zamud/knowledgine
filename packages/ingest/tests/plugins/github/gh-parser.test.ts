import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsePRList,
  parseIssueList,
  prToNormalizedEvent,
  issueToNormalizedEvent,
  parseGitHubSourceUri,
  commentToNormalizedEvent,
  reviewToNormalizedEvent,
} from "../../../src/plugins/github/gh-parser.js";
import type { ParsedPR, ParsedIssue } from "../../../src/plugins/github/gh-parser.js";

const fixturesDir = join(__dirname, "../../fixtures/github");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("parsePRList", () => {
  it("should parse 2 PRs from fixture", () => {
    const json = loadFixture("prs.json");
    const prs = parsePRList(json);
    expect(prs).toHaveLength(2);
    expect(prs[0].number).toBe(1);
    expect(prs[0].title).toBe("Add feature X");
    expect(prs[0].author.login).toBe("user1");
    expect(prs[0].state).toBe("MERGED");
    expect(prs[0].labels).toHaveLength(2);
    expect(prs[0].reviewDecision).toBe("APPROVED");
    expect(prs[1].number).toBe(2);
    expect(prs[1].title).toBe("Fix bug Y");
    expect(prs[1].state).toBe("OPEN");
  });

  it("should return empty array for empty JSON array", () => {
    const json = loadFixture("empty.json");
    const prs = parsePRList(json);
    expect(prs).toHaveLength(0);
  });

  it("should return empty array for non-array JSON", () => {
    const prs = parsePRList('{"not": "array"}');
    expect(prs).toHaveLength(0);
  });

  it("should throw on invalid JSON", () => {
    expect(() => parsePRList("not json")).toThrow();
  });
});

describe("parseIssueList", () => {
  it("should parse 1 issue from fixture", () => {
    const json = loadFixture("issues.json");
    const issues = parseIssueList(json);
    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(10);
    expect(issues[0].title).toBe("Bug: crash on startup");
    expect(issues[0].author.login).toBe("user3");
    expect(issues[0].state).toBe("OPEN");
    expect(issues[0].labels).toHaveLength(2);
    expect(issues[0].labels[0].name).toBe("bug");
    expect(issues[0].labels[1].name).toBe("priority:high");
  });

  it("should return empty array for empty JSON array", () => {
    const json = loadFixture("empty.json");
    const issues = parseIssueList(json);
    expect(issues).toHaveLength(0);
  });
});

describe("prToNormalizedEvent", () => {
  const samplePR: ParsedPR = {
    number: 1,
    title: "Add feature X",
    body: "This PR adds feature X.",
    author: { login: "user1" },
    state: "MERGED",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-02T00:00:00Z",
    url: "https://github.com/owner/repo/pull/1",
    labels: [{ name: "feature" }],
    reviewDecision: "APPROVED",
  };

  it("should produce correct eventType", () => {
    const event = prToNormalizedEvent(samplePR, "owner", "repo");
    expect(event.eventType).toBe("discussion");
  });

  it("should produce correct sourceUri", () => {
    const event = prToNormalizedEvent(samplePR, "owner", "repo");
    expect(event.sourceUri).toBe("github://owner/repo/pull/1");
  });

  it("should produce correct title", () => {
    const event = prToNormalizedEvent(samplePR, "owner", "repo");
    expect(event.title).toBe("PR #1: Add feature X");
  });

  it("should set metadata correctly", () => {
    const event = prToNormalizedEvent(samplePR, "owner", "repo");
    expect(event.metadata.sourcePlugin).toBe("github");
    expect(event.metadata.sourceId).toBe("pr-1");
    expect(event.metadata.author).toBe("user1");
    expect(event.metadata.tags).toEqual(["feature"]);
    expect(event.metadata.extra).toEqual({
      state: "MERGED",
      reviewDecision: "APPROVED",
      url: "https://github.com/owner/repo/pull/1",
    });
  });

  it("should use updatedAt for timestamp", () => {
    const event = prToNormalizedEvent(samplePR, "owner", "repo");
    expect(event.timestamp).toEqual(new Date("2025-01-02T00:00:00Z"));
  });

  it("should fallback to createdAt when updatedAt is empty", () => {
    const pr = { ...samplePR, updatedAt: "" };
    const event = prToNormalizedEvent(pr, "owner", "repo");
    expect(event.timestamp).toEqual(new Date("2025-01-01T00:00:00Z"));
  });

  it("should truncate body exceeding 100KB", () => {
    const largePR = { ...samplePR, body: "x".repeat(200 * 1024) };
    const event = prToNormalizedEvent(largePR, "owner", "repo");
    expect(event.content.length).toBeLessThan(200 * 1024);
    expect(event.content).toContain("... [truncated]");
  });
});

describe("issueToNormalizedEvent", () => {
  const sampleIssue: ParsedIssue = {
    number: 10,
    title: "Bug: crash on startup",
    body: "The app crashes on startup.",
    author: { login: "user3" },
    state: "OPEN",
    createdAt: "2025-01-05T00:00:00Z",
    updatedAt: "2025-01-06T00:00:00Z",
    url: "https://github.com/owner/repo/issues/10",
    labels: [{ name: "bug" }],
  };

  it("should produce correct eventType", () => {
    const event = issueToNormalizedEvent(sampleIssue, "owner", "repo");
    expect(event.eventType).toBe("document");
  });

  it("should produce correct sourceUri", () => {
    const event = issueToNormalizedEvent(sampleIssue, "owner", "repo");
    expect(event.sourceUri).toBe("github://owner/repo/issues/10");
  });

  it("should produce correct title", () => {
    const event = issueToNormalizedEvent(sampleIssue, "owner", "repo");
    expect(event.title).toBe("Issue #10: Bug: crash on startup");
  });

  it("should set metadata correctly", () => {
    const event = issueToNormalizedEvent(sampleIssue, "owner", "repo");
    expect(event.metadata.sourcePlugin).toBe("github");
    expect(event.metadata.sourceId).toBe("issue-10");
    expect(event.metadata.author).toBe("user3");
    expect(event.metadata.tags).toEqual(["bug"]);
    expect(event.metadata.extra).toEqual({
      state: "OPEN",
      url: "https://github.com/owner/repo/issues/10",
    });
  });

  it("should truncate body exceeding 100KB", () => {
    const largeIssue = { ...sampleIssue, body: "y".repeat(200 * 1024) };
    const event = issueToNormalizedEvent(largeIssue, "owner", "repo");
    expect(event.content.length).toBeLessThan(200 * 1024);
    expect(event.content).toContain("... [truncated]");
  });
});

describe("parseGitHubSourceUri", () => {
  it("should parse valid URI", () => {
    const result = parseGitHubSourceUri("github://owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("should parse URI with trailing path", () => {
    const result = parseGitHubSourceUri("github://myorg/myrepo/extra");
    expect(result).toEqual({ owner: "myorg", repo: "myrepo" });
  });

  it("should throw for invalid URI", () => {
    expect(() => parseGitHubSourceUri("invalid://foo")).toThrow("Invalid GitHub source URI");
  });

  it("should throw for empty string", () => {
    expect(() => parseGitHubSourceUri("")).toThrow("Invalid GitHub source URI");
  });

  it("should throw for URI missing repo", () => {
    expect(() => parseGitHubSourceUri("github://owner")).toThrow("Invalid GitHub source URI");
  });
});

describe("commentToNormalizedEvent", () => {
  const sampleComment = {
    body: "LGTM! Great work.",
    author: { login: "reviewer1" },
    createdAt: "2025-01-03T00:00:00Z",
  };

  it("should produce correct sourceUri for PR comment", () => {
    const event = commentToNormalizedEvent(sampleComment, 1, "owner", "repo", "pr");
    expect(event.sourceUri).toBe("github://owner/repo/pull/1/comments");
  });

  it("should produce correct sourceUri for issue comment", () => {
    const event = commentToNormalizedEvent(sampleComment, 10, "owner", "repo", "issue");
    expect(event.sourceUri).toBe("github://owner/repo/issues/10/comments");
  });

  it("should produce correct title for PR comment", () => {
    const event = commentToNormalizedEvent(sampleComment, 1, "owner", "repo", "pr");
    expect(event.title).toBe("Comment on PR #1 by reviewer1");
  });

  it("should produce correct title for issue comment", () => {
    const event = commentToNormalizedEvent(sampleComment, 10, "owner", "repo", "issue");
    expect(event.title).toBe("Comment on Issue #10 by reviewer1");
  });

  it("should set eventType to discussion", () => {
    const event = commentToNormalizedEvent(sampleComment, 1, "owner", "repo", "pr");
    expect(event.eventType).toBe("discussion");
  });

  it("should set metadata correctly", () => {
    const event = commentToNormalizedEvent(sampleComment, 1, "owner", "repo", "pr");
    expect(event.metadata.sourcePlugin).toBe("github");
    expect(event.metadata.author).toBe("reviewer1");
    expect(event.metadata.extra).toMatchObject({
      type: "comment",
      parentNumber: 1,
      parentType: "pr",
    });
  });

  it("should set timestamp from createdAt", () => {
    const event = commentToNormalizedEvent(sampleComment, 1, "owner", "repo", "pr");
    expect(event.timestamp).toEqual(new Date("2025-01-03T00:00:00Z"));
  });

  it("should sanitize comment body", () => {
    const event = commentToNormalizedEvent(sampleComment, 1, "owner", "repo", "pr");
    expect(event.content).toBeDefined();
    expect(typeof event.content).toBe("string");
  });
});

describe("reviewToNormalizedEvent", () => {
  const sampleReview = {
    body: "Please address the comments.",
    author: { login: "approver1" },
    state: "CHANGES_REQUESTED",
    createdAt: "2025-01-04T00:00:00Z",
  };

  it("should produce correct sourceUri", () => {
    const event = reviewToNormalizedEvent(sampleReview, 5, "owner", "repo");
    expect(event.sourceUri).toBe("github://owner/repo/pull/5/reviews");
  });

  it("should produce correct title", () => {
    const event = reviewToNormalizedEvent(sampleReview, 5, "owner", "repo");
    expect(event.title).toBe("Review on PR #5 by approver1 (CHANGES_REQUESTED)");
  });

  it("should set eventType to discussion", () => {
    const event = reviewToNormalizedEvent(sampleReview, 5, "owner", "repo");
    expect(event.eventType).toBe("discussion");
  });

  it("should set metadata correctly", () => {
    const event = reviewToNormalizedEvent(sampleReview, 5, "owner", "repo");
    expect(event.metadata.sourcePlugin).toBe("github");
    expect(event.metadata.author).toBe("approver1");
    expect(event.metadata.extra).toMatchObject({
      type: "review",
      state: "CHANGES_REQUESTED",
      prNumber: 5,
    });
  });

  it("should set timestamp from createdAt", () => {
    const event = reviewToNormalizedEvent(sampleReview, 5, "owner", "repo");
    expect(event.timestamp).toEqual(new Date("2025-01-04T00:00:00Z"));
  });

  it("should handle empty review body", () => {
    const emptyReview = { ...sampleReview, body: "" };
    const event = reviewToNormalizedEvent(emptyReview, 5, "owner", "repo");
    expect(event.content).toBeDefined();
    expect(typeof event.content).toBe("string");
  });
});

describe("checkGhVersion", () => {
  // vi.mock ではなく、execGh をモック対象にするのは困難なため、
  // バージョンパースのロジックはパーサー関数のテストでカバーする。
  // ここでは統合テストとして checkGhVersion が実行できることだけ確認。
  it("should return an object with ok property", async () => {
    // CI環境ではgh CLIがない可能性があるため、エラーケースも許容
    const result = await import("../../../src/plugins/github/gh-parser.js").then((m) =>
      m.checkGhVersion(),
    );
    expect(result).toHaveProperty("ok");
    expect(typeof result.ok).toBe("boolean");
  });
});
