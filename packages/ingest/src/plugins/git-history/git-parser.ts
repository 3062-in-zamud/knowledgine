import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename } from "node:path";
import type { NormalizedEvent } from "../../types.js";

const execFileAsync = promisify(execFile);
const SHA1_REGEX = /^[0-9a-f]{40}$/;

export async function execGit(
  args: string[],
  options: { cwd: string; maxBuffer?: number; timeout?: number }
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

const GIT_LOG_FORMAT =
  "---REC_SEP---%n%H%n%aI%n%an%n%ae%n%P%n%s%n---BODY_SEP---%n%b%n---REC_END---";

export function getGitLogFormat(): string {
  return GIT_LOG_FORMAT;
}

export function parseGitLog(raw: string): ParsedCommit[] {
  const records = raw.split("---REC_END---");
  const commits: ParsedCommit[] = [];

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;

    const recSepIdx = trimmed.indexOf("---REC_SEP---");
    if (recSepIdx === -1) continue;

    const afterRecSep = trimmed.slice(recSepIdx + "---REC_SEP---".length).trimStart();
    const bodySepIdx = afterRecSep.indexOf("---BODY_SEP---");
    if (bodySepIdx === -1) continue;

    const headerPart = afterRecSep.slice(0, bodySepIdx).trimEnd();
    const bodyPart = afterRecSep.slice(bodySepIdx + "---BODY_SEP---".length).trimStart().trimEnd();

    const lines = headerPart.split("\n");
    if (lines.length < 6) continue;

    const hash = lines[0].trim();
    const authorDate = lines[1].trim();
    const authorName = lines[2].trim();
    const authorEmail = lines[3].trim();
    const parentsRaw = lines[4].trim();
    const subject = lines[5].trim();

    if (!hash || !SHA1_REGEX.test(hash)) continue;

    const parents = parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [];

    commits.push({
      hash,
      authorDate,
      authorName,
      authorEmail,
      parents,
      subject,
      body: bodyPart,
      isMerge: parents.length > 1,
    });
  }

  return commits;
}

export async function getDiffsParallel(
  hashes: string[],
  options: { cwd: string; concurrency?: number; maxDiffSize?: number }
): Promise<Map<string, string>> {
  if (hashes.length === 0) return new Map();

  const concurrency = options.concurrency ?? 5;
  const maxDiffSize = options.maxDiffSize ?? 50 * 1024;
  const result = new Map<string, string>();

  for (let i = 0; i < hashes.length; i += concurrency) {
    const batch = hashes.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (hash) => {
        try {
          const diff = await execGit(
            ["-c", "core.quotepath=false", "show", "--format=", "--diff-filter=ACDMRT", hash],
            { cwd: options.cwd }
          );
          result.set(hash, truncateDiff(diff, maxDiffSize));
        } catch (err) {
          console.error(`Failed to get diff for commit ${hash}:`, err);
          result.set(hash, "");
        }
      })
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
  currentBranch?: string
): NormalizedEvent {
  const metadata: NormalizedEvent["metadata"] = {
    sourcePlugin: "git-history",
    sourceId: commit.hash,
    author: `${commit.authorName} <${commit.authorEmail}>`,
    project: basename(repoPath),
    ...(currentBranch !== undefined ? { branch: currentBranch } : {}),
  };

  return {
    sourceUri: `git://${repoPath}#${commit.hash}`,
    eventType: "commit",
    title: commit.subject,
    content: `Author: ${commit.authorName} <${commit.authorEmail}>\nDate: ${commit.authorDate}\n\n${commit.subject}\n\n${commit.body}\n\n---\n${diff}`,
    timestamp: new Date(commit.authorDate),
    metadata,
    relatedPaths: extractChangedPaths(diff),
  };
}
