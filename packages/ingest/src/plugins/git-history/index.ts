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
  execGit,
  parseGitLog,
  getDiffsParallel,
  commitToNormalizedEvent,
  validateCheckpoint,
  getGitLogFormat,
} from "./git-parser.js";

export class GitHistoryPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "git-history",
    name: "Git History",
    version: "0.1.0",
    schemes: ["git://"],
    priority: 1,
  };

  readonly triggers: TriggerConfig[] = [
    { type: "git_hook", hook: "post-commit" },
    { type: "git_hook", hook: "post-merge" },
  ];

  private limit: number = 100;
  private since?: string;
  private unlimited: boolean = false;

  async initialize(config?: PluginConfig): Promise<PluginInitResult> {
    try {
      await execGit(["--version"], { cwd: process.cwd(), timeout: 5000 });

      if (config) {
        if (typeof config.limit === "number") {
          if (!Number.isFinite(config.limit) || config.limit <= 0) {
            return { ok: false, error: "Invalid limit: must be a finite positive number" };
          }
          this.limit = config.limit;
        }
        if (typeof config.since === "string") this.since = config.since;
        if (config.unlimited === true) this.unlimited = true;
      }

      return { ok: true };
    } catch {
      return { ok: false, error: "git is not installed or not in PATH" };
    }
  }

  async *ingestAll(sourcePath: SourceURI): AsyncGenerator<NormalizedEvent> {
    try {
      await execGit(["rev-parse", "--git-dir"], { cwd: sourcePath });
    } catch {
      return;
    }

    const currentBranch = await this.getBranch(sourcePath);

    const logArgs = ["log", "--reverse", "--date=iso-strict", `--format=${getGitLogFormat()}`];
    if (this.since) {
      logArgs.push(`--since=${this.since}`);
    } else if (!this.unlimited) {
      logArgs.push(`-${this.limit}`);
    }

    let raw: string;
    try {
      raw = await execGit(logArgs, {
        cwd: sourcePath,
      });
    } catch (err: unknown) {
      // コミットが0件の場合、git logがエラーを返すケースがある（初期ブランチでコミットなし）
      const errObj = err as { stderr?: string; code?: number };
      if (
        typeof errObj.stderr === "string" &&
        errObj.stderr.includes("does not have any commits yet")
      ) {
        return;
      }
      throw err;
    }

    const commits = parseGitLog(raw);
    if (commits.length === 0) return;

    const hashes = commits.map((c) => c.hash);
    const diffs = await getDiffsParallel(hashes, { cwd: sourcePath });

    const total = commits.length;
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const diffResult = diffs.get(commit.hash) ?? { diff: "" };
      const event = commitToNormalizedEvent(commit, diffResult.diff, sourcePath, currentBranch);
      if (diffResult.skipped) {
        event.metadata.skippedReason = "large_diff";
      }
      if ((i + 1) % 50 === 0 || i + 1 === total) {
        process.stderr.write(`  Processing commit ${i + 1}/${total}...\n`);
      }
      yield event;
    }
  }

  async *ingestIncremental(
    sourcePath: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    validateCheckpoint(checkpoint);

    const currentBranch = await this.getBranch(sourcePath);

    const raw = await execGit(
      [
        "log",
        "--reverse",
        "--date=iso-strict",
        `--format=${getGitLogFormat()}`,
        `${checkpoint}..HEAD`,
      ],
      { cwd: sourcePath },
    );

    const commits = parseGitLog(raw);
    if (commits.length === 0) return;

    const hashes = commits.map((c) => c.hash);
    const diffs = await getDiffsParallel(hashes, { cwd: sourcePath });

    const totalIncr = commits.length;
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const diffResult = diffs.get(commit.hash) ?? { diff: "" };
      const event = commitToNormalizedEvent(commit, diffResult.diff, sourcePath, currentBranch);
      if (diffResult.skipped) {
        event.metadata.skippedReason = "large_diff";
      }
      if ((i + 1) % 50 === 0 || i + 1 === totalIncr) {
        process.stderr.write(`  Processing commit ${i + 1}/${totalIncr}...\n`);
      }
      yield event;
    }
  }

  async getCurrentCheckpoint(sourcePath: SourceURI): Promise<string> {
    const result = await execGit(["rev-parse", "HEAD"], { cwd: sourcePath });
    return result.trim();
  }

  async dispose(): Promise<void> {
    // no-op
  }

  private async getBranch(sourcePath: string): Promise<string | undefined> {
    try {
      const branch = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: sourcePath,
      });
      const trimmed = branch.trim();
      return trimmed === "HEAD" ? undefined : trimmed;
    } catch {
      return undefined;
    }
  }
}
