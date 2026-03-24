import type {
  IngestPlugin,
  PluginManifest,
  TriggerConfig,
  PluginConfig,
  PluginInitResult,
  NormalizedEvent,
  SourceURI,
} from "../../types.js";
import {
  execGh,
  checkGhAuth,
  checkGhVersion,
  parseGitHubSourceUri,
  parsePRList,
  parseIssueList,
  prToNormalizedEvent,
  issueToNormalizedEvent,
  commentToNormalizedEvent,
  reviewToNormalizedEvent,
  parseReviewComments,
} from "./gh-parser.js";

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

  async initialize(_config?: PluginConfig): Promise<PluginInitResult> {
    const versionCheck = await checkGhVersion();
    if (!versionCheck.ok) {
      return { ok: false, error: versionCheck.error ?? "gh CLI version check failed" };
    }
    const authed = await checkGhAuth();
    if (!authed) {
      return { ok: false, error: "gh CLI not authenticated. Run 'gh auth login'" };
    }
    return { ok: true };
  }

  async *ingestAll(sourceUri: SourceURI): AsyncGenerator<NormalizedEvent> {
    const { owner, repo } = parseGitHubSourceUri(sourceUri);

    // PRs
    const prJson = await this.execWithRetry([
      "pr",
      "list",
      "-R",
      `${owner}/${repo}`,
      "--json",
      "number,title,body,author,labels,createdAt,updatedAt,url,state,reviewDecision",
      "--limit",
      "1000",
      "--state",
      "all",
    ]);
    for (const pr of parsePRList(prJson)) {
      // PR 本体のイベント
      yield prToNormalizedEvent(pr, owner, repo);

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
      } catch {
        // 詳細取得失敗は警告のみ（PR本体は既にyield済み）
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
      } catch {
        // graceful degradation: warn only
        process.stderr.write(`  Could not fetch inline review comments for PR #${pr.number}\n`);
      }
    }

    // Issues
    const issueJson = await this.execWithRetry([
      "issue",
      "list",
      "-R",
      `${owner}/${repo}`,
      "--json",
      "number,title,body,author,labels,createdAt,updatedAt,url,state",
      "--limit",
      "1000",
      "--state",
      "all",
    ]);
    for (const issue of parseIssueList(issueJson)) {
      yield issueToNormalizedEvent(issue, owner, repo);
    }
  }

  async *ingestIncremental(
    sourceUri: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    const { owner, repo } = parseGitHubSourceUri(sourceUri);

    // checkpoint を1分前にオフセット（GitHub検索APIの分単位精度対応）
    const checkpointDate = new Date(checkpoint);
    checkpointDate.setMinutes(checkpointDate.getMinutes() - 1);
    const adjustedCheckpoint = checkpointDate.toISOString().replace(/\.\d{3}Z$/, "Z");

    // PRs (incremental)
    const prJson = await this.execWithRetry([
      "pr",
      "list",
      "-R",
      `${owner}/${repo}`,
      "--json",
      "number,title,body,author,labels,createdAt,updatedAt,url,state,reviewDecision",
      "--limit",
      "1000",
      "--state",
      "all",
      "--search",
      `updated:>=${adjustedCheckpoint}`,
    ]);
    for (const pr of parsePRList(prJson)) {
      yield prToNormalizedEvent(pr, owner, repo);
    }

    // Issues (incremental)
    const issueJson = await this.execWithRetry([
      "issue",
      "list",
      "-R",
      `${owner}/${repo}`,
      "--json",
      "number,title,body,author,labels,createdAt,updatedAt,url,state",
      "--limit",
      "1000",
      "--state",
      "all",
      "--search",
      `updated:>=${adjustedCheckpoint}`,
    ]);
    for (const issue of parseIssueList(issueJson)) {
      yield issueToNormalizedEvent(issue, owner, repo);
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
