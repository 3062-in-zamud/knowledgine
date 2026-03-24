import type {
  IngestPlugin,
  PluginManifest,
  TriggerConfig,
  PluginConfig,
  PluginInitResult,
  NormalizedEvent,
  SourceURI,
} from "../../types.js";
import { execGh, checkGhAuth, checkGhVersion } from "../github/gh-parser.js";
import {
  parseRunList,
  parseRunDetail,
  runToNormalizedEvent,
  extractFailureInfo,
} from "./gh-actions-parser.js";

export class CicdPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "cicd",
    name: "CI/CD (GitHub Actions)",
    version: "0.1.0",
    schemes: ["cicd://"],
    priority: 2,
  };

  readonly triggers: TriggerConfig[] = [
    { type: "scheduled" as const, cron: "*/30 * * * *" },
    { type: "manual" as const },
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
    const { owner, repo } = parseCicdSourceUri(sourceUri);

    const runsJson = await this.execWithRetry([
      "run",
      "list",
      "--json",
      "databaseId,displayTitle,status,conclusion,createdAt,updatedAt,workflowName,headBranch,event",
      "--limit",
      "50",
      "-R",
      `${owner}/${repo}`,
    ]);

    for (const run of parseRunList(runsJson)) {
      let failureDetail: string | undefined;

      if (run.conclusion === "failure") {
        try {
          const detailJson = await this.execWithRetry([
            "run",
            "view",
            String(run.databaseId),
            "--json",
            "jobs,conclusion,url",
            "-R",
            `${owner}/${repo}`,
          ]);
          const detail = parseRunDetail(detailJson);
          failureDetail = extractFailureInfo(detail);
        } catch {
          // 詳細取得失敗は無視（run 本体は yield する）
        }
      }

      yield runToNormalizedEvent(run, owner, repo, failureDetail);
    }
  }

  async *ingestIncremental(
    sourceUri: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    const { owner, repo } = parseCicdSourceUri(sourceUri);
    const checkpointDate = new Date(checkpoint);

    const runsJson = await this.execWithRetry([
      "run",
      "list",
      "--json",
      "databaseId,displayTitle,status,conclusion,createdAt,updatedAt,workflowName,headBranch,event",
      "--limit",
      "50",
      "-R",
      `${owner}/${repo}`,
    ]);

    const runs = parseRunList(runsJson).filter((run) => new Date(run.createdAt) > checkpointDate);

    for (const run of runs) {
      let failureDetail: string | undefined;

      if (run.conclusion === "failure") {
        try {
          const detailJson = await this.execWithRetry([
            "run",
            "view",
            String(run.databaseId),
            "--json",
            "jobs,conclusion,url",
            "-R",
            `${owner}/${repo}`,
          ]);
          const detail = parseRunDetail(detailJson);
          failureDetail = extractFailureInfo(detail);
        } catch {
          // 詳細取得失敗は無視
        }
      }

      yield runToNormalizedEvent(run, owner, repo, failureDetail);
    }
  }

  async getCurrentCheckpoint(sourceUri: SourceURI): Promise<string> {
    const { owner, repo } = parseCicdSourceUri(sourceUri);

    try {
      const runsJson = await this.execWithRetry([
        "run",
        "list",
        "--json",
        "databaseId,displayTitle,status,conclusion,createdAt,updatedAt,workflowName,headBranch,event",
        "--limit",
        "50",
        "-R",
        `${owner}/${repo}`,
      ]);

      const runs = parseRunList(runsJson);
      if (runs.length === 0) {
        return new Date(0).toISOString();
      }

      // 最新の createdAt を返す
      const latest = runs.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));
      return latest.createdAt;
    } catch {
      return new Date(0).toISOString();
    }
  }

  async dispose(): Promise<void> {
    // no-op
  }

  private isRateLimitError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("rate limit") ||
        error.message.includes("API rate limit") ||
        error.message.includes("secondary rate limit"))
    );
  }

  private async execWithRetry(args: string[], maxRetries = 3): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await execGh(args);
      } catch (error) {
        if (this.isRateLimitError(error) && attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
    throw new Error("Max retries exceeded");
  }
}

function parseCicdSourceUri(uri: string): { owner: string; repo: string } {
  // "cicd://owner/repo" → { owner, repo }
  const match = uri.match(/^cicd:\/\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid CI/CD source URI: ${uri}`);
  return { owner: match[1], repo: match[2] };
}
