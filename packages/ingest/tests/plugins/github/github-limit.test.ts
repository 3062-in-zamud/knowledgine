import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/plugins/github/gh-parser.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../src/plugins/github/gh-parser.js")>();
  return {
    ...original,
    execGh: vi.fn(),
    checkGhAuth: vi.fn().mockResolvedValue(true),
    checkGhVersion: vi.fn().mockResolvedValue({ ok: true }),
    fetchRepoMeta: vi.fn(),
  };
});

import { GitHubPlugin } from "../../../src/plugins/github/index.js";
import { execGh, fetchRepoMeta } from "../../../src/plugins/github/gh-parser.js";

const mockedExecGh = vi.mocked(execGh);
const mockedFetchRepoMeta = vi.mocked(fetchRepoMeta);

function makePRs(count: number, startNumber = 1): string {
  const prs = Array.from({ length: count }, (_, i) => ({
    number: startNumber + i,
    title: `PR #${startNumber + i}`,
    body: "",
    author: { login: "user" },
    state: "OPEN",
    createdAt: new Date(2025, 0, Math.max(1, count - i)).toISOString(),
    updatedAt: new Date(2025, 0, Math.max(1, count - i)).toISOString(),
    url: `https://github.com/owner/repo/pull/${startNumber + i}`,
    labels: [],
    reviewDecision: "",
  }));
  return JSON.stringify(prs);
}

function makeIssues(count: number, startNumber = 1): string {
  const issues = Array.from({ length: count }, (_, i) => ({
    number: startNumber + i,
    title: `Issue #${startNumber + i}`,
    body: "",
    author: { login: "user" },
    state: "OPEN",
    createdAt: new Date(2025, 0, Math.max(1, count - i)).toISOString(),
    updatedAt: new Date(2025, 0, Math.max(1, count - i)).toISOString(),
    url: `https://github.com/owner/repo/issues/${startNumber + i}`,
    labels: [],
  }));
  return JSON.stringify(issues);
}

const EMPTY_JSON = "[]";
const EMPTY_DETAIL = '{"comments":[],"reviews":[]}';

describe("GitHub --limit flag", () => {
  let plugin: GitHubPlugin;

  beforeEach(() => {
    plugin = new GitHubPlugin();
    vi.clearAllMocks();
    mockedFetchRepoMeta.mockResolvedValue({
      has_issues: true,
      has_wiki: true,
      is_archived: false,
      default_branch: "main",
    });
  });

  it("should accept limit via initialize config", async () => {
    const result = await plugin.initialize({ limit: 50 });
    expect(result.ok).toBe(true);
  });

  it("should stop fetching PRs after reaching limit", async () => {
    await plugin.initialize({ limit: 30 });

    // Provide 100 PRs but plugin should stop after 30
    const fixture = makePRs(100, 1);
    mockedExecGh.mockResolvedValueOnce(fixture);
    // Details for first 30 PRs
    for (let i = 0; i < 30; i++) {
      mockedExecGh.mockResolvedValueOnce(EMPTY_DETAIL).mockResolvedValueOnce(EMPTY_JSON);
    }
    mockedExecGh.mockResolvedValueOnce(EMPTY_JSON); // issues

    const events: unknown[] = [];
    for await (const event of plugin.ingestAll("github://owner/repo")) {
      events.push(event);
    }

    // Should have stopped at 30 PRs
    expect(events).toHaveLength(30);
  });

  it("should stop fetching issues after reaching limit", async () => {
    await plugin.initialize({ limit: 20 });

    // No PRs
    mockedExecGh.mockResolvedValueOnce(EMPTY_JSON);
    // 50 issues but limit is 20
    mockedExecGh.mockResolvedValueOnce(makeIssues(50, 1));

    const events: unknown[] = [];
    for await (const event of plugin.ingestAll("github://owner/repo")) {
      events.push(event);
    }

    expect(events).toHaveLength(20);
  });

  it("should reject non-positive limit", async () => {
    const result = await plugin.initialize({ limit: 0 });
    expect(result.ok).toBe(false);
  });
});
