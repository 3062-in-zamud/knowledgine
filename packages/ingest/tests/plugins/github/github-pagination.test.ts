import { describe, it, expect, vi, beforeEach } from "vitest";

// gh-parser モジュールをモック
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
import { execGh, fetchRepoMeta } from "../../../src/plugins/github/gh-parser.js";

const mockedExecGh = vi.mocked(execGh);
const mockedFetchRepoMeta = vi.mocked(fetchRepoMeta);

/** N 件の PR フィクスチャ JSON を生成する */
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

/** N 件の Issue フィクスチャ JSON を生成する */
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

describe("GitHub pagination", () => {
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

  it("1回の取得が --limit 100 であること", async () => {
    mockedExecGh.mockResolvedValueOnce(EMPTY_JSON).mockResolvedValueOnce(EMPTY_JSON);

    for await (const _ of plugin.ingestAll("github://owner/repo")) {
      // consume
    }

    const prCall = mockedExecGh.mock.calls[0][0];
    expect(prCall).toContain("--limit");
    const limitIndex = prCall.indexOf("--limit");
    expect(prCall[limitIndex + 1]).toBe("100");
  });

  it("取得件数が100件の場合に次のページを取得すること（PRs）", async () => {
    // 1ページ目: 100件（ページ終端）
    const page1 = makePRs(100, 1);
    // 2ページ目: 50件（最終ページ）
    const page2 = makePRs(50, 101);

    // Setup: page1(100 PRs) → 100×(detail+reviewComments) → page2(50 PRs) → 50×(detail+reviewComments) → issues(empty)
    mockedExecGh.mockResolvedValueOnce(page1);
    for (let i = 0; i < 100; i++) {
      mockedExecGh.mockResolvedValueOnce(EMPTY_DETAIL).mockResolvedValueOnce(EMPTY_JSON);
    }
    mockedExecGh.mockResolvedValueOnce(page2);
    for (let i = 0; i < 50; i++) {
      mockedExecGh.mockResolvedValueOnce(EMPTY_DETAIL).mockResolvedValueOnce(EMPTY_JSON);
    }
    mockedExecGh.mockResolvedValueOnce(EMPTY_JSON); // issues

    const events: unknown[] = [];
    for await (const event of plugin.ingestAll("github://owner/repo")) {
      events.push(event);
    }

    // 150 PRs (page1: 100 + page2: 50)
    expect(events).toHaveLength(150);

    // PR リスト取得が2回呼ばれていること
    const prListCalls = mockedExecGh.mock.calls.filter(
      ([args]) => args[0] === "pr" && args[1] === "list",
    );
    expect(prListCalls).toHaveLength(2);
  });

  it("取得件数が100件未満の場合にループが終了すること（PRs）", async () => {
    // 99件 → ループ終了
    const fixture = makePRs(99, 1);
    mockedExecGh.mockResolvedValueOnce(fixture);
    for (let i = 0; i < 99; i++) {
      mockedExecGh.mockResolvedValueOnce(EMPTY_DETAIL).mockResolvedValueOnce(EMPTY_JSON);
    }
    mockedExecGh.mockResolvedValueOnce(EMPTY_JSON); // issues

    const events: unknown[] = [];
    for await (const event of plugin.ingestAll("github://owner/repo")) {
      events.push(event);
    }

    // 99 PRs のみ
    expect(events).toHaveLength(99);

    // PR リスト取得は1回のみ
    const prListCalls = mockedExecGh.mock.calls.filter(
      ([args]) => args[0] === "pr" && args[1] === "list",
    );
    expect(prListCalls).toHaveLength(1);
  });

  it("取得件数が100件の場合に次のページを取得すること（Issues）", async () => {
    // Issues: 1ページ目100件 → 2ページ目30件
    const issuePage1 = makeIssues(100, 1);
    const issuePage2 = makeIssues(30, 101);

    mockedExecGh
      .mockResolvedValueOnce(EMPTY_JSON) // PRs (empty, no pagination)
      .mockResolvedValueOnce(issuePage1)
      .mockResolvedValueOnce(issuePage2);

    const events: unknown[] = [];
    for await (const event of plugin.ingestAll("github://owner/repo")) {
      events.push(event);
    }

    // 130 issues
    expect(events).toHaveLength(130);

    const issueListCalls = mockedExecGh.mock.calls.filter(
      ([args]) => args[0] === "issue" && args[1] === "list",
    );
    expect(issueListCalls).toHaveLength(2);
  });

  it("進捗メッセージが stderr に出力されること（PR fetch完了時）", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // 1ページ分だけ（50件）
    const fixture = makePRs(50, 1);
    mockedExecGh.mockResolvedValueOnce(fixture);
    for (let i = 0; i < 50; i++) {
      mockedExecGh.mockResolvedValueOnce(EMPTY_DETAIL).mockResolvedValueOnce(EMPTY_JSON);
    }
    mockedExecGh.mockResolvedValueOnce(EMPTY_JSON); // issues

    for await (const _ of plugin.ingestAll("github://owner/repo")) {
      // consume
    }

    const stderrCalls = stderrSpy.mock.calls.map(([msg]) => msg as string);
    const prProgressMsg = stderrCalls.find(
      (msg) => msg.includes("Fetching PRs") && msg.includes("50"),
    );
    expect(prProgressMsg).toBeDefined();

    stderrSpy.mockRestore();
  });

  it("2ページ目取得時に created:< カーソルが渡されること", async () => {
    // 1ページ目: 100件、最後の createdAt = "2025-01-01T00:00:00.000Z"
    const oldestDate = "2025-01-01T00:00:00.000Z";
    const prs = Array.from({ length: 100 }, (_, i) => ({
      number: 100 - i,
      title: `PR #${100 - i}`,
      body: "",
      author: { login: "user" },
      state: "OPEN",
      createdAt: i === 99 ? oldestDate : new Date(2025, 0, 100 - i).toISOString(),
      updatedAt: new Date(2025, 0, 100 - i).toISOString(),
      url: `https://github.com/owner/repo/pull/${100 - i}`,
      labels: [],
      reviewDecision: "",
    }));
    const page1 = JSON.stringify(prs);
    const page2 = EMPTY_JSON; // 2ページ目は0件でループ終了

    mockedExecGh.mockResolvedValueOnce(page1);
    for (let i = 0; i < 100; i++) {
      mockedExecGh.mockResolvedValueOnce(EMPTY_DETAIL).mockResolvedValueOnce(EMPTY_JSON);
    }
    mockedExecGh.mockResolvedValueOnce(page2); // PRs page 2
    mockedExecGh.mockResolvedValueOnce(EMPTY_JSON); // issues

    for await (const _ of plugin.ingestAll("github://owner/repo")) {
      // consume
    }

    // 2回目の PR リスト呼び出しに created:<= カーソルが含まれること
    // (created:<= を使って境界上のアイテムを取り逃さない; 重複は IngestEngine が sourceUri で除去)
    const prListCalls = mockedExecGh.mock.calls.filter(
      ([args]) => args[0] === "pr" && args[1] === "list",
    );
    expect(prListCalls).toHaveLength(2);
    const secondCallArgs = prListCalls[1][0];
    const searchIndex = secondCallArgs.indexOf("--search");
    expect(searchIndex).toBeGreaterThan(-1);
    const searchValue = secondCallArgs[searchIndex + 1];
    expect(searchValue).toContain(`created:<=${oldestDate}`);
  });
});
