import type {
  IngestPlugin,
  PluginManifest,
  TriggerConfig,
  PluginConfig,
  PluginInitResult,
  NormalizedEvent,
  SourceURI,
  ErrorCategory,
} from "../../types.js";
import {
  execGh,
  checkGhAuth,
  checkGhVersion,
  parseGitHubSourceUri,
  fetchRepoMeta,
  parsePRList,
  parseIssueList,
  prToNormalizedEvent,
  issueToNormalizedEvent,
  commentToNormalizedEvent,
  reviewToNormalizedEvent,
  parseReviewComments,
} from "./gh-parser.js";
import type { RepoMeta } from "./gh-parser.js";

const PAGE_SIZE = 100;

function categorizeError(err: unknown): ErrorCategory {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("rate limit")) return "rate_limit";
  if (msg.includes("403") || msg.includes("forbidden") || msg.includes("permission"))
    return "permission";
  if (msg.includes("json") || msg.includes("parse") || msg.includes("syntax")) return "parse";
  return "network";
}

export class GitHubPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "github",
    name: "GitHub PRs & Issues",
    version: "0.1.0",
    schemes: ["github://"],
    priority: 1,
  };

  readonly triggers: TriggerConfig[] = [
    { type: "scheduled", cron: "0 * * * *" },
    { type: "manual" },
  ];

  private itemLimit: number = Infinity;

  async initialize(config?: PluginConfig): Promise<PluginInitResult> {
    const versionCheck = await checkGhVersion();
    if (!versionCheck.ok) {
      return { ok: false, error: versionCheck.error ?? "gh CLI version check failed" };
    }
    const authed = await checkGhAuth();
    if (!authed) {
      return { ok: false, error: "gh CLI not authenticated. Run 'gh auth login'" };
    }

    if (config && typeof config.limit === "number") {
      if (!Number.isFinite(config.limit) || config.limit <= 0) {
        return { ok: false, error: "Invalid limit: must be a finite positive number" };
      }
      this.itemLimit = config.limit;
    }

    return { ok: true };
  }

  async *ingestAll(sourceUri: SourceURI): AsyncGenerator<NormalizedEvent> {
    const { owner, repo } = parseGitHubSourceUri(sourceUri);

    // リポジトリメタ情報の事前チェック
    let repoMeta: RepoMeta | undefined;
    try {
      repoMeta = await fetchRepoMeta(owner, repo);
    } catch {
      // 事前チェック失敗は通常フローにフォールバック
    }
    if (repoMeta?.has_issues === false) {
      process.stderr.write(`  ⚠ Issues: disabled on ${owner}/${repo} (skipped)\n`);
    }

    // PRs with date-based cursor pagination
    let oldestPRSeen: string | undefined;
    let totalPRs = 0;

    while (true) {
      const prArgs = [
        "pr",
        "list",
        "-R",
        `${owner}/${repo}`,
        "--json",
        "number,title,body,author,labels,createdAt,updatedAt,url,state,reviewDecision",
        "--limit",
        String(PAGE_SIZE),
        "--state",
        "all",
      ];
      if (oldestPRSeen) {
        // created:<= to include items with the exact same timestamp.
        // Duplicates from boundary overlap are deduplicated by IngestEngine via sourceUri uniqueness.
        prArgs.push("--search", `created:<=${oldestPRSeen}`);
      }

      const prJson = await this.execWithRetry(prArgs);
      const prs = parsePRList(prJson);
      if (prs.length === 0) break;

      let hitLimit = false;
      for (const pr of prs) {
        if (totalPRs >= this.itemLimit) {
          hitLimit = true;
          break;
        }
        // PR 本体のイベント
        yield prToNormalizedEvent(pr, owner, repo);
        totalPRs++;

        // PR のコメントとレビューを取得
        try {
          const detailJson = await this.execWithRetry([
            "pr",
            "view",
            String(pr.number),
            "-R",
            `${owner}/${repo}`,
            "--json",
            "comments,reviews",
          ]);
          const details = JSON.parse(detailJson) as {
            comments?: Array<{ body: string; author: { login: string }; createdAt: string }>;
            reviews?: Array<{
              body: string;
              author: { login: string };
              state: string;
              createdAt: string;
            }>;
          };
          if (details.comments) {
            for (const comment of details.comments) {
              yield commentToNormalizedEvent(comment, pr.number, owner, repo, "pr");
            }
          }
          if (details.reviews) {
            for (const review of details.reviews) {
              yield reviewToNormalizedEvent(review, pr.number, owner, repo);
            }
          }
        } catch (err) {
          yield {
            sourceUri: `github://${owner}/${repo}/pr/${pr.number}/details`,
            eventType: "discussion" as const,
            title: `[error] PR #${pr.number} details fetch failed`,
            content: "",
            timestamp: new Date(),
            metadata: {
              sourcePlugin: "github",
              sourceId: `pr-${pr.number}-details-error`,
              skippedReason: "api_error",
              extra: {
                errorCategory: categorizeError(err),
                errorMessage: err instanceof Error ? err.message : String(err),
              },
            },
          };
        }

        // インラインレビューコメント（ファイル位置情報付き）
        try {
          const reviewCommentsJson = await execGh([
            "api",
            `repos/${owner}/${repo}/pulls/${pr.number}/comments`,
            "--paginate",
          ]);
          const reviewComments = parseReviewComments(reviewCommentsJson);
          for (const rc of reviewComments) {
            yield commentToNormalizedEvent(
              { body: rc.body, author: { login: rc.user.login }, createdAt: rc.created_at },
              pr.number,
              owner,
              repo,
              "pr",
              { path: rc.path, line: rc.line, side: rc.side, diffHunk: rc.diff_hunk },
            );
          }
        } catch (err) {
          yield {
            sourceUri: `github://${owner}/${repo}/pr/${pr.number}/inline-comments`,
            eventType: "discussion" as const,
            title: `[error] PR #${pr.number} inline review comments fetch failed`,
            content: "",
            timestamp: new Date(),
            metadata: {
              sourcePlugin: "github",
              sourceId: `pr-${pr.number}-inline-comments-error`,
              skippedReason: "api_error",
              extra: {
                errorCategory: categorizeError(err),
                errorMessage: err instanceof Error ? err.message : String(err),
              },
            },
          };
        }
      }

      process.stderr.write(`  Fetching PRs... (${totalPRs} fetched)\n`);

      if (hitLimit) break;
      // 取得件数が PAGE_SIZE 未満なら最終ページ
      if (prs.length < PAGE_SIZE) break;

      // カーソルを最古の createdAt に更新（無限ループ防止）
      const newCursor = prs[prs.length - 1].createdAt;
      if (newCursor === oldestPRSeen) {
        process.stderr.write(
          `  ⚠ Pagination stalled: ${PAGE_SIZE}+ PRs share timestamp ${newCursor}. Breaking.\n`,
        );
        break;
      }
      oldestPRSeen = newCursor;
    }

    // Issues with date-based cursor pagination
    if (repoMeta?.has_issues !== false) {
      let oldestIssueSeen: string | undefined;
      let totalIssues = 0;

      while (true) {
        const issueArgs = [
          "issue",
          "list",
          "-R",
          `${owner}/${repo}`,
          "--json",
          "number,title,body,author,labels,createdAt,updatedAt,url,state",
          "--limit",
          String(PAGE_SIZE),
          "--state",
          "all",
        ];
        if (oldestIssueSeen) {
          // created:<= to include items with the exact same timestamp.
          // Duplicates from boundary overlap are deduplicated by IngestEngine via sourceUri uniqueness.
          issueArgs.push("--search", `created:<=${oldestIssueSeen}`);
        }

        const issueJson = await this.execWithRetry(issueArgs);
        const issues = parseIssueList(issueJson);
        if (issues.length === 0) break;

        let hitIssueLimit = false;
        for (const issue of issues) {
          if (totalIssues >= this.itemLimit) {
            hitIssueLimit = true;
            break;
          }
          yield issueToNormalizedEvent(issue, owner, repo);
          totalIssues++;
        }

        process.stderr.write(`  Fetching issues... (${totalIssues} fetched)\n`);

        if (hitIssueLimit) break;
        // 取得件数が PAGE_SIZE 未満なら最終ページ
        if (issues.length < PAGE_SIZE) break;

        // カーソルを最古の createdAt に更新（無限ループ防止）
        const newIssueCursor = issues[issues.length - 1].createdAt;
        if (newIssueCursor === oldestIssueSeen) {
          process.stderr.write(
            `  ⚠ Pagination stalled: ${PAGE_SIZE}+ issues share timestamp ${newIssueCursor}. Breaking.\n`,
          );
          break;
        }
        oldestIssueSeen = newIssueCursor;
      }
    }
  }

  async *ingestIncremental(
    sourceUri: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    const { owner, repo } = parseGitHubSourceUri(sourceUri);

    // リポジトリメタ情報の事前チェック
    let repoMeta: RepoMeta | undefined;
    try {
      repoMeta = await fetchRepoMeta(owner, repo);
    } catch {
      // 事前チェック失敗は通常フローにフォールバック
    }
    if (repoMeta?.has_issues === false) {
      process.stderr.write(`  ⚠ Issues: disabled on ${owner}/${repo} (skipped)\n`);
    }

    // checkpoint を1分前にオフセット（GitHub検索APIの分単位精度対応）
    const checkpointDate = new Date(checkpoint);
    checkpointDate.setMinutes(checkpointDate.getMinutes() - 1);
    const adjustedCheckpoint = checkpointDate.toISOString().replace(/\.\d{3}Z$/, "Z");

    // PRs (incremental) with pagination
    let oldestPRSeen: string | undefined;

    while (true) {
      const prArgs = [
        "pr",
        "list",
        "-R",
        `${owner}/${repo}`,
        "--json",
        "number,title,body,author,labels,createdAt,updatedAt,url,state,reviewDecision",
        "--limit",
        String(PAGE_SIZE),
        "--state",
        "all",
        "--search",
        oldestPRSeen
          ? // created:<= to include boundary items; dedup handled by IngestEngine via sourceUri
            `updated:>=${adjustedCheckpoint} created:<=${oldestPRSeen}`
          : `updated:>=${adjustedCheckpoint}`,
      ];

      const prJson = await this.execWithRetry(prArgs);
      const prs = parsePRList(prJson);
      if (prs.length === 0) break;

      for (const pr of prs) {
        yield prToNormalizedEvent(pr, owner, repo);
      }

      if (prs.length < PAGE_SIZE) break;
      oldestPRSeen = prs[prs.length - 1].createdAt;
    }

    // Issues (incremental) with pagination
    if (repoMeta?.has_issues !== false) {
      let oldestIssueSeen: string | undefined;

      while (true) {
        const issueArgs = [
          "issue",
          "list",
          "-R",
          `${owner}/${repo}`,
          "--json",
          "number,title,body,author,labels,createdAt,updatedAt,url,state",
          "--limit",
          String(PAGE_SIZE),
          "--state",
          "all",
          "--search",
          oldestIssueSeen
            ? // created:<= to include boundary items; dedup handled by IngestEngine via sourceUri
              `updated:>=${adjustedCheckpoint} created:<=${oldestIssueSeen}`
            : `updated:>=${adjustedCheckpoint}`,
        ];

        const issueJson = await this.execWithRetry(issueArgs);
        const issues = parseIssueList(issueJson);
        if (issues.length === 0) break;

        for (const issue of issues) {
          yield issueToNormalizedEvent(issue, owner, repo);
        }

        if (issues.length < PAGE_SIZE) break;
        oldestIssueSeen = issues[issues.length - 1].createdAt;
      }
    }
  }

  async getCurrentCheckpoint(_sourceUri: SourceURI): Promise<string> {
    return new Date().toISOString();
  }

  async dispose(): Promise<void> {
    // no-op
  }

  private isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes("rate limit");
  }

  /** Rate limit エラーのみリトライ。それ以外のエラーは即座にスロー */
  private async execWithRetry(args: string[], maxRetries = 3): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await execGh(args);
      } catch (error) {
        lastError = error;
        if (this.isRateLimitError(error) && attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (!this.isRateLimitError(error)) {
          throw error; // rate limit 以外のエラーは即座にスロー
        }
      }
    }
    throw lastError;
  }
}
