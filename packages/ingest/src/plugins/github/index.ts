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
      yield prToNormalizedEvent(pr, owner, repo);
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

  /** Exponential backoff リトライ (3回、1s→2s→4s) */
  private async execWithRetry(args: string[], maxRetries = 3): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await execGh(args);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }
}
