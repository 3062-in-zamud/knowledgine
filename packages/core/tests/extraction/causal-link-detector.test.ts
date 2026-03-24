import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { CausalLinkDetector } from "../../src/extraction/causal-link-detector.js";

// テスト用ノートをDBに直接INSERTするヘルパー
function insertNote(
  db: TestContext["db"],
  opts: {
    file_path: string;
    title: string;
    content: string;
    frontmatter_json?: string | null;
    created_at: string;
  },
): number {
  const stmt = db.prepare(`
    INSERT INTO knowledge_notes (file_path, title, content, frontmatter_json, created_at, updated_at, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    opts.file_path,
    opts.title,
    opts.content,
    opts.frontmatter_json ?? null,
    opts.created_at,
    opts.created_at,
    null,
  );
  return Number(result.lastInsertRowid);
}

function countLinks(db: TestContext["db"]): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM note_links").get() as { count: number };
  return row.count;
}

describe("CausalLinkDetector", () => {
  let ctx: TestContext;
  let detector: CausalLinkDetector;

  beforeEach(() => {
    ctx = createTestDb();
    detector = new CausalLinkDetector(ctx.repository);
  });

  // ── detectSessionToCommitLinks ──────────────────────────────────────────

  describe("detectSessionToCommitLinks", () => {
    it("セッション終了〜コミットが1799秒+ブランチ一致 → caused リンクを生成する", () => {
      const sessionTime = new Date("2024-01-01T10:00:00Z");
      const commitTime = new Date(sessionTime.getTime() + 1799 * 1000);

      insertNote(ctx.db, {
        file_path: "claude-session://project/session1",
        title: "Session 1",
        content: "session content",
        frontmatter_json: JSON.stringify({ gitBranch: "feature/auth" }),
        created_at: sessionTime.toISOString(),
      });
      insertNote(ctx.db, {
        file_path: "git://commit/abc1234567890",
        title: "Commit abc1234",
        content: "commit content",
        frontmatter_json: JSON.stringify({ branch: "feature/auth" }),
        created_at: commitTime.toISOString(),
      });

      const count = detector.detectSessionToCommitLinks();
      expect(count).toBe(1);
      expect(countLinks(ctx.db)).toBe(1);
    });

    it("ちょうど1800秒 → リンクを生成しない（strictly less than）", () => {
      const sessionTime = new Date("2024-01-01T10:00:00Z");
      const commitTime = new Date(sessionTime.getTime() + 1800 * 1000);

      insertNote(ctx.db, {
        file_path: "claude-session://project/session2",
        title: "Session 2",
        content: "session content",
        frontmatter_json: JSON.stringify({ gitBranch: "feature/auth" }),
        created_at: sessionTime.toISOString(),
      });
      insertNote(ctx.db, {
        file_path: "git://commit/def1234567890",
        title: "Commit def1234",
        content: "commit content",
        frontmatter_json: JSON.stringify({ branch: "feature/auth" }),
        created_at: commitTime.toISOString(),
      });

      const count = detector.detectSessionToCommitLinks();
      expect(count).toBe(0);
    });

    it("1801秒 → リンクを生成しない", () => {
      const sessionTime = new Date("2024-01-01T10:00:00Z");
      const commitTime = new Date(sessionTime.getTime() + 1801 * 1000);

      insertNote(ctx.db, {
        file_path: "claude-session://project/session3",
        title: "Session 3",
        content: "session content",
        frontmatter_json: JSON.stringify({ gitBranch: "feature/auth" }),
        created_at: sessionTime.toISOString(),
      });
      insertNote(ctx.db, {
        file_path: "git://commit/ghi1234567890",
        title: "Commit ghi1234",
        content: "commit content",
        frontmatter_json: JSON.stringify({ branch: "feature/auth" }),
        created_at: commitTime.toISOString(),
      });

      const count = detector.detectSessionToCommitLinks();
      expect(count).toBe(0);
    });

    it("ブランチ不一致 → リンクを生成しない", () => {
      const sessionTime = new Date("2024-01-01T10:00:00Z");
      const commitTime = new Date(sessionTime.getTime() + 300 * 1000);

      insertNote(ctx.db, {
        file_path: "claude-session://project/session4",
        title: "Session 4",
        content: "session content",
        frontmatter_json: JSON.stringify({ gitBranch: "feature/auth" }),
        created_at: sessionTime.toISOString(),
      });
      insertNote(ctx.db, {
        file_path: "git://commit/jkl1234567890",
        title: "Commit jkl1234",
        content: "commit content",
        frontmatter_json: JSON.stringify({ branch: "main" }),
        created_at: commitTime.toISOString(),
      });

      const count = detector.detectSessionToCommitLinks();
      expect(count).toBe(0);
    });

    it("タイムスタンプがnull → graceful skip（エラーにならない）", () => {
      // created_at を最小値で挿入し、frontmatterにタイムスタンプ情報なしのケース
      const stmt = ctx.db.prepare(`
        INSERT INTO knowledge_notes (file_path, title, content, frontmatter_json, created_at, updated_at, content_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        "claude-session://project/session-no-branch",
        "Session No Branch",
        "content",
        null, // frontmatterなし → ブランチ情報なし
        "2024-01-01T00:00:00Z",
        "2024-01-01T00:00:00Z",
        null,
      );
      stmt.run(
        "git://commit/mno1234567890",
        "Commit mno",
        "content",
        null, // frontmatterなし
        "2024-01-01T00:00:00Z",
        "2024-01-01T00:00:00Z",
        null,
      );

      // エラーにならずに実行できること
      expect(() => detector.detectSessionToCommitLinks()).not.toThrow();
    });
  });

  // ── detectCommitToPRLinks ───────────────────────────────────────────────

  describe("detectCommitToPRLinks", () => {
    it("PRコンテンツにフルSHA含有 → included_in リンクを生成する", () => {
      const commitSha = "abc1234567890abcdef1234567890abcdef123456";

      insertNote(ctx.db, {
        file_path: `git://commit/${commitSha}`,
        title: "Commit",
        content: "commit content",
        frontmatter_json: JSON.stringify({ branch: "feature/auth" }),
        created_at: "2024-01-01T10:00:00Z",
      });
      insertNote(ctx.db, {
        file_path: "github://repos/org/repo/pulls/42",
        title: "PR #42",
        content: `This PR includes commit ${commitSha} for the auth feature.`,
        frontmatter_json: JSON.stringify({ branch: "feature/auth" }),
        created_at: "2024-01-02T10:00:00Z",
      });

      const count = detector.detectCommitToPRLinks();
      expect(count).toBe(1);
    });

    it("7文字短縮SHA含有 → included_in リンクを生成する", () => {
      const commitSha = "abc1234567890";
      const shortSha = commitSha.slice(0, 7); // "abc1234"

      insertNote(ctx.db, {
        file_path: `git://commit/${commitSha}`,
        title: "Commit",
        content: "commit content",
        frontmatter_json: null,
        created_at: "2024-01-01T10:00:00Z",
      });
      insertNote(ctx.db, {
        file_path: "github://repos/org/repo/pulls/43",
        title: "PR #43",
        content: `This PR includes commit ${shortSha} for the feature.`,
        frontmatter_json: null,
        created_at: "2024-01-02T10:00:00Z",
      });

      const count = detector.detectCommitToPRLinks();
      expect(count).toBe(1);
    });
  });

  // ── detectReviewToFixCommitLinks ────────────────────────────────────────

  describe("detectReviewToFixCommitLinks", () => {
    it("レビュー後24時間以内の同ブランチコミット → triggered リンクを生成する", () => {
      const reviewTime = new Date("2024-01-01T10:00:00Z");
      const commitTime = new Date(reviewTime.getTime() + 23 * 60 * 60 * 1000); // 23時間後

      insertNote(ctx.db, {
        file_path: "github://repos/org/repo/pulls/42/reviews/1",
        title: "Review on PR #42",
        content: "Please fix the null check.",
        frontmatter_json: JSON.stringify({ branch: "feature/auth" }),
        created_at: reviewTime.toISOString(),
      });
      insertNote(ctx.db, {
        file_path: "git://commit/fix1234567890",
        title: "Fix commit",
        content: "fix null check",
        frontmatter_json: JSON.stringify({ branch: "feature/auth" }),
        created_at: commitTime.toISOString(),
      });

      const count = detector.detectReviewToFixCommitLinks();
      expect(count).toBe(1);
    });

    it("レビュー後25時間（24時間超過）のコミット → リンクを生成しない", () => {
      const reviewTime = new Date("2024-01-01T10:00:00Z");
      const commitTime = new Date(reviewTime.getTime() + 25 * 60 * 60 * 1000); // 25時間後

      insertNote(ctx.db, {
        file_path: "github://repos/org/repo/pulls/44/reviews/2",
        title: "Review on PR #44",
        content: "Please fix the null check.",
        frontmatter_json: JSON.stringify({ branch: "feature/other" }),
        created_at: reviewTime.toISOString(),
      });
      insertNote(ctx.db, {
        file_path: "git://commit/late1234567890",
        title: "Late commit",
        content: "late fix",
        frontmatter_json: JSON.stringify({ branch: "feature/other" }),
        created_at: commitTime.toISOString(),
      });

      const count = detector.detectReviewToFixCommitLinks();
      expect(count).toBe(0);
    });
  });

  // ── 冪等性 ─────────────────────────────────────────────────────────────

  describe("冪等性", () => {
    it("同じ検出を2回実行してもリンク数が増えない", () => {
      const sessionTime = new Date("2024-01-01T10:00:00Z");
      const commitTime = new Date(sessionTime.getTime() + 600 * 1000);

      insertNote(ctx.db, {
        file_path: "claude-session://project/session-idem",
        title: "Session idem",
        content: "session content",
        frontmatter_json: JSON.stringify({ gitBranch: "feature/idem" }),
        created_at: sessionTime.toISOString(),
      });
      insertNote(ctx.db, {
        file_path: "git://commit/idem1234567890",
        title: "Commit idem",
        content: "commit content",
        frontmatter_json: JSON.stringify({ branch: "feature/idem" }),
        created_at: commitTime.toISOString(),
      });

      detector.detectSessionToCommitLinks();
      const countAfterFirst = countLinks(ctx.db);

      detector.detectSessionToCommitLinks();
      const countAfterSecond = countLinks(ctx.db);

      expect(countAfterFirst).toBe(1);
      expect(countAfterSecond).toBe(1); // 増えない
    });
  });

  // ── getNotesBySourceUriPrefix ───────────────────────────────────────────

  describe("getNotesBySourceUriPrefix", () => {
    it("claude-session:// プレフィックスで正しくフィルタする", () => {
      insertNote(ctx.db, {
        file_path: "claude-session://project/s1",
        title: "S1",
        content: "content",
        created_at: "2024-01-01T00:00:00Z",
      });
      insertNote(ctx.db, {
        file_path: "claude-session://project/s2",
        title: "S2",
        content: "content",
        created_at: "2024-01-01T00:00:00Z",
      });
      insertNote(ctx.db, {
        file_path: "git://commit/xyz",
        title: "Git",
        content: "content",
        created_at: "2024-01-01T00:00:00Z",
      });

      const notes = ctx.repository.getNotesBySourceUriPrefix("claude-session://");
      expect(notes).toHaveLength(2);
      expect(notes.every((n) => n.file_path.startsWith("claude-session://"))).toBe(true);
    });
  });

  // ── detectAll ──────────────────────────────────────────────────────────

  describe("detectAll", () => {
    it("全リンクタイプの合計サマリーを返す", () => {
      // Session → Commit (caused)
      const sessionTime = new Date("2024-01-01T10:00:00Z");
      const commitTime = new Date(sessionTime.getTime() + 600 * 1000);
      insertNote(ctx.db, {
        file_path: "claude-session://project/all-session",
        title: "All Session",
        content: "content",
        frontmatter_json: JSON.stringify({ gitBranch: "feature/all" }),
        created_at: sessionTime.toISOString(),
      });
      const commitSha = "abcdef1234567890abcdef1234567890abcdef12";
      insertNote(ctx.db, {
        file_path: `git://commit/${commitSha}`,
        title: "All Commit",
        content: "content",
        frontmatter_json: JSON.stringify({ branch: "feature/all" }),
        created_at: commitTime.toISOString(),
      });

      // Commit → PR (included_in)
      insertNote(ctx.db, {
        file_path: "github://repos/org/repo/pulls/100",
        title: "All PR",
        content: `PR includes ${commitSha}`,
        frontmatter_json: null,
        created_at: new Date(commitTime.getTime() + 3600 * 1000).toISOString(),
      });

      const summary = detector.detectAll();
      expect(summary.causedLinks).toBe(1);
      expect(summary.includedInLinks).toBe(1);
      expect(summary.triggeredLinks).toBeGreaterThanOrEqual(0);
      expect(summary.errors).toBe(0);
    });
  });
});
