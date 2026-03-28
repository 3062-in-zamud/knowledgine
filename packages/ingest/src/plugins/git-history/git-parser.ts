import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename } from "node:path";
import type { NormalizedEvent } from "../../types.js";

const execFileAsync = promisify(execFile);
const SHA1_REGEX = /^[0-9a-f]{40}$/;

export async function execGit(
  args: string[],
  options: { cwd: string; maxBuffer?: number; timeout?: number },
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: options.cwd,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
    timeout: options.timeout ?? 30_000,
  });
  return stdout;
}

export function validateCheckpoint(checkpoint: string): string {
  if (!SHA1_REGEX.test(checkpoint)) {
    throw new Error(`Invalid checkpoint format: ${checkpoint}`);
  }
  return checkpoint;
}

export interface ParsedCommit {
  hash: string;
  authorDate: string;
  authorName: string;
  authorEmail: string;
  parents: string[];
  subject: string;
  body: string;
  isMerge: boolean;
}

const GIT_LOG_FORMAT = "%H%n%an%n%ae%n%ad%n%P%n%s%n%b%n---END---";

export function getGitLogFormat(): string {
  return GIT_LOG_FORMAT;
}

export function parseGitLog(raw: string): ParsedCommit[] {
  const records = raw.split("\n---END---");
  const commits: ParsedCommit[] = [];

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    if (lines.length < 6) continue;

    const hash = lines[0].trim();
    if (!hash || !SHA1_REGEX.test(hash)) continue;

    const authorName = lines[1].trim();
    const authorEmail = lines[2].trim();
    const authorDate = lines[3].trim();
    const parentsRaw = lines[4].trim();
    const subject = lines[5].trim();
    const body = lines.slice(6).join("\n").trim();

    const parents = parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [];

    commits.push({
      hash,
      authorDate,
      authorName,
      authorEmail,
      parents,
      subject,
      body,
      isMerge: parents.length > 1,
    });
  }

  return commits;
}

export interface DiffResult {
  diff: string;
  skipped?: boolean;
}

export async function getDiffsParallel(
  hashes: string[],
  options: { cwd: string; concurrency?: number; maxDiffSize?: number },
): Promise<Map<string, DiffResult>> {
  if (hashes.length === 0) return new Map();

  const concurrency = options.concurrency ?? 5;
  const maxDiffSize = options.maxDiffSize ?? 50 * 1024;
  const result = new Map<string, DiffResult>();

  for (let i = 0; i < hashes.length; i += concurrency) {
    const batch = hashes.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (hash) => {
        try {
          const diff = await execGit(
            ["-c", "core.quotepath=false", "show", "--format=", "--diff-filter=ACDMRT", hash],
            { cwd: options.cwd },
          );
          result.set(hash, { diff: truncateDiff(diff, maxDiffSize) });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isMaxBuffer =
            errMsg.toLowerCase().includes("maxbuffer") ||
            errMsg.toLowerCase().includes("max buffer");
          if (isMaxBuffer) {
            result.set(hash, { diff: "", skipped: true });
          } else {
            console.error(`Failed to get diff for commit ${hash}:`, err);
            result.set(hash, { diff: "" });
          }
        }
      }),
    );
  }

  return result;
}

export function truncateDiff(diff: string, maxSize?: number): string {
  const limit = maxSize ?? 50 * 1024;
  if (diff.length <= limit) return diff;
  return diff.slice(0, limit) + "\n... [truncated]";
}

function extractChangedPaths(diff: string): string[] {
  const paths: string[] = [];
  const lines = diff.split("\n");
  for (const line of lines) {
    const match = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (match && match[1]) {
      paths.push(match[1]);
    }
  }
  return paths;
}

export function commitToNormalizedEvent(
  commit: ParsedCommit,
  diff: string,
  repoPath: string,
  currentBranch?: string,
): NormalizedEvent {
  const metadata: NormalizedEvent["metadata"] = {
    sourcePlugin: "git-history",
    sourceId: commit.hash,
    author: `${commit.authorName} <${commit.authorEmail}>`,
    project: basename(repoPath),
    ...(currentBranch !== undefined ? { branch: currentBranch } : {}),
  };

  return {
    sourceUri: `git://${repoPath}/commit/${commit.hash}`,
    eventType: "change",
    title: commit.subject,
    content: `Author: ${commit.authorName} <${commit.authorEmail}>\nDate: ${commit.authorDate}\n\n${commit.subject}\n\n${commit.body}\n\n---\n${diff}`,
    timestamp: new Date(commit.authorDate),
    metadata,
    relatedPaths: extractChangedPaths(diff),
  };
}
