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

  async initialize(_config?: PluginConfig): Promise<PluginInitResult> {
    return { ok: true };
  }

  async *ingestAll(sourcePath: SourceURI): AsyncGenerator<NormalizedEvent> {
    try {
      await execGit(["rev-parse", "--git-dir"], { cwd: sourcePath });
    } catch {
      return;
    }

    const currentBranch = await this.getBranch(sourcePath);

    let raw: string;
    try {
      raw = await execGit(["log", "--reverse", `--format=${getGitLogFormat()}`], {
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

    for (const commit of commits) {
      const diff = diffs.get(commit.hash) ?? "";
      yield commitToNormalizedEvent(commit, diff, sourcePath, currentBranch);
    }
  }

  async *ingestIncremental(
    sourcePath: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    validateCheckpoint(checkpoint);

    const currentBranch = await this.getBranch(sourcePath);

    const raw = await execGit(
      ["log", "--reverse", `--format=${getGitLogFormat()}`, `${checkpoint}..HEAD`],
      { cwd: sourcePath },
    );

    const commits = parseGitLog(raw);
    if (commits.length === 0) return;

    const hashes = commits.map((c) => c.hash);
    const diffs = await getDiffsParallel(hashes, { cwd: sourcePath });

    for (const commit of commits) {
      const diff = diffs.get(commit.hash) ?? "";
      yield commitToNormalizedEvent(commit, diff, sourcePath, currentBranch);
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
