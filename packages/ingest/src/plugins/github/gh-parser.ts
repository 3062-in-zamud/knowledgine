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

export interface RepoMeta {
  has_issues: boolean;
  has_wiki: boolean;
  is_archived: boolean;
  default_branch: string;
}

const REPOSITORY_NOT_FOUND_CODE = "GITHUB_REPOSITORY_NOT_FOUND";
const REPOSITORY_NOT_FOUND_PATTERNS = [
  /could not resolve to a repository/i,
  /repository not found/i,
  /\bnot found\b.*\bhttp 404\b|\bhttp 404\b.*\bnot found\b/i,
];

const DEFAULT_REPO_META: RepoMeta = {
  has_issues: true,
  has_wiki: true,
  is_archived: false,
  default_branch: "main",
};

export async function fetchRepoMeta(owner: string, repo: string): Promise<RepoMeta> {
  const json = await execGh([
    "api",
    `repos/${owner}/${repo}`,
    "--jq",
    "{has_issues,has_wiki,is_archived,default_branch}",
  ]);
  return JSON.parse(json) as RepoMeta;
}

export { DEFAULT_REPO_META };

export function createRepositoryNotFoundError(owner: string, repo: string, cause?: unknown): Error {
  const repository = `${owner}/${repo}`;
  const error = new Error(`Repository '${repository}' not found.`) as Error & {
    code?: string;
    repository?: string;
    cause?: unknown;
  };
  error.name = "RepositoryNotFoundError";
  error.code = REPOSITORY_NOT_FOUND_CODE;
  error.repository = repository;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

export function isRepositoryNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
    if (
      candidate.code === REPOSITORY_NOT_FOUND_CODE ||
      candidate.name === "RepositoryNotFoundError"
    ) {
      return true;
    }
    if (typeof candidate.message === "string") {
      const message = candidate.message;
      return REPOSITORY_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(message));
    }
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return REPOSITORY_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(message));
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

export interface ReviewCommentPosition {
  path?: string;
  line?: number;
  side?: string;
  diffHunk?: string;
}

export interface ParsedReviewComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
  path?: string;
  line?: number;
  side?: string;
  diff_hunk?: string;
}

export function parseReviewComments(json: string): ParsedReviewComment[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) return [];
  return data.map((item: Record<string, unknown>) => ({
    id: item.id as number,
    body: (item.body as string) ?? "",
    user: (item.user as { login: string }) ?? { login: "unknown" },
    created_at: (item.created_at as string) ?? "",
    path: item.path as string | undefined,
    line: item.line as number | undefined,
    side: item.side as string | undefined,
    diff_hunk: item.diff_hunk as string | undefined,
  }));
}

export function commentToNormalizedEvent(
  comment: { body: string; author: { login: string }; createdAt: string },
  prOrIssueNumber: number,
  owner: string,
  repo: string,
  type: "pr" | "issue",
  position?: ReviewCommentPosition,
): NormalizedEvent {
  const content = sanitizeContent(truncateContent(comment.body));
  const urlPath = type === "pr" ? "pull" : "issues";

  const extra: Record<string, unknown> = {
    parentNumber: prOrIssueNumber,
    parentType: type,
  };

  if (position) {
    extra.type = "review_comment";
    if (position.path !== undefined) extra.filePath = position.path;
    if (position.line !== undefined) extra.line = position.line;
    if (position.side !== undefined) extra.side = position.side;
    if (position.diffHunk !== undefined) extra.diffHunk = truncateContent(position.diffHunk);
  } else {
    extra.type = "comment";
  }

  return {
    sourceUri: `github://${owner}/${repo}/${urlPath}/${prOrIssueNumber}/comments`,
    eventType: "discussion",
    title: `Comment on ${type === "pr" ? "PR" : "Issue"} #${prOrIssueNumber} by ${comment.author.login}`,
    content,
    timestamp: new Date(comment.createdAt),
    metadata: {
      sourcePlugin: "github",
      sourceId: `${type}-${prOrIssueNumber}-comment-${comment.createdAt}`,
      author: comment.author.login,
      tags: [],
      extra,
    },
  };
}

export function reviewToNormalizedEvent(
  review: { body: string; author: { login: string }; state: string; createdAt: string },
  prNumber: number,
  owner: string,
  repo: string,
): NormalizedEvent {
  const content = sanitizeContent(truncateContent(review.body));
  return {
    sourceUri: `github://${owner}/${repo}/pull/${prNumber}/reviews`,
    eventType: "discussion",
    title: `Review on PR #${prNumber} by ${review.author.login} (${review.state})`,
    content,
    timestamp: new Date(review.createdAt),
    metadata: {
      sourcePlugin: "github",
      sourceId: `pr-${prNumber}-review-${review.createdAt}`,
      author: review.author.login,
      tags: [],
      extra: {
        type: "review",
        state: review.state,
        prNumber,
      },
    },
  };
}
