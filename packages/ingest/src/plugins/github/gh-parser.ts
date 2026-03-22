import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NormalizedEvent } from "../../types.js";
import { sanitizeContent } from "../../normalizer.js";

const execFileAsync = promisify(execFile);

export async function execGh(
  args: string[],
  options?: { timeout?: number; maxBuffer?: number },
): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, {
    timeout: options?.timeout ?? 60_000,
    maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024,
  });
  return stdout;
}

export async function checkGhAuth(): Promise<boolean> {
  try {
    await execGh(["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}

export async function checkGhVersion(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const output = await execGh(["--version"]);
    // "gh version 2.45.0 (2024-...)" のようなフォーマット
    const match = output.match(/version\s+(\d+\.\d+\.\d+)/);
    if (!match) return { ok: false, error: "Could not parse gh version" };
    const version = match[1];
    // 最低 2.40.0
    const [major, minor] = version.split(".").map(Number);
    if (major < 2 || (major === 2 && minor < 40)) {
      return { ok: false, version, error: `gh version ${version} is too old. Minimum: 2.40.0` };
    }
    return { ok: true, version };
  } catch {
    return { ok: false, error: "gh CLI not found" };
  }
}

export function parseGitHubSourceUri(uri: string): { owner: string; repo: string } {
  // "github://owner/repo" → { owner, repo }
  const match = uri.match(/^github:\/\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid GitHub source URI: ${uri}`);
  return { owner: match[1], repo: match[2] };
}

export interface ParsedPR {
  number: number;
  title: string;
  body: string;
  author: { login: string };
  state: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: Array<{ name: string }>;
  reviewDecision: string;
}

export interface ParsedIssue {
  number: number;
  title: string;
  body: string;
  author: { login: string };
  state: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: Array<{ name: string }>;
}

const MAX_CONTENT_SIZE = 100 * 1024; // 100KB

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_SIZE) return content;
  return content.slice(0, MAX_CONTENT_SIZE) + "\n... [truncated]";
}

export function parsePRList(json: string): ParsedPR[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) return [];
  return data.map((item: Record<string, unknown>) => ({
    number: item.number as number,
    title: (item.title as string) ?? "",
    body: (item.body as string) ?? "",
    author: (item.author as { login: string }) ?? { login: "unknown" },
    state: (item.state as string) ?? "",
    createdAt: (item.createdAt as string) ?? "",
    updatedAt: (item.updatedAt as string) ?? "",
    url: (item.url as string) ?? "",
    labels: (item.labels as Array<{ name: string }>) ?? [],
    reviewDecision: (item.reviewDecision as string) ?? "",
  }));
}

export function parseIssueList(json: string): ParsedIssue[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) return [];
  return data.map((item: Record<string, unknown>) => ({
    number: item.number as number,
    title: (item.title as string) ?? "",
    body: (item.body as string) ?? "",
    author: (item.author as { login: string }) ?? { login: "unknown" },
    state: (item.state as string) ?? "",
    createdAt: (item.createdAt as string) ?? "",
    updatedAt: (item.updatedAt as string) ?? "",
    url: (item.url as string) ?? "",
    labels: (item.labels as Array<{ name: string }>) ?? [],
  }));
}

export function prToNormalizedEvent(pr: ParsedPR, owner: string, repo: string): NormalizedEvent {
  const content = sanitizeContent(truncateContent(pr.body));
  return {
    sourceUri: `github://${owner}/${repo}/pull/${pr.number}`,
    eventType: "discussion",
    title: `PR #${pr.number}: ${pr.title}`,
    content,
    timestamp: new Date(pr.updatedAt || pr.createdAt),
    metadata: {
      sourcePlugin: "github",
      sourceId: `pr-${pr.number}`,
      author: pr.author.login,
      tags: pr.labels.map((l) => l.name),
      extra: {
        state: pr.state,
        reviewDecision: pr.reviewDecision,
        url: pr.url,
      },
    },
  };
}

export function issueToNormalizedEvent(
  issue: ParsedIssue,
  owner: string,
  repo: string,
): NormalizedEvent {
  const content = sanitizeContent(truncateContent(issue.body));
  return {
    sourceUri: `github://${owner}/${repo}/issues/${issue.number}`,
    eventType: "document",
    title: `Issue #${issue.number}: ${issue.title}`,
    content,
    timestamp: new Date(issue.updatedAt || issue.createdAt),
    metadata: {
      sourcePlugin: "github",
      sourceId: `issue-${issue.number}`,
      author: issue.author.login,
      tags: issue.labels.map((l) => l.name),
      extra: {
        state: issue.state,
        url: issue.url,
      },
    },
  };
}
