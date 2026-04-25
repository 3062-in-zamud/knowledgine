import { createHash } from "crypto";
import type { KnowledgeData, KnowledgeEvent, SourceType, EventType } from "@knowledgine/core";
import type { NormalizedEvent } from "./types.js";

const SECRET_PATTERNS: RegExp[] = [
  // --- KNOW-401: env-var-style assignments ---
  // Redact the whole assignment including the variable name prefix, not just
  // the value. Prevents leaks like "GITHUB_[REDACTED]" that expose the target
  // service even when the token value itself is masked. Placed first in the
  // array so the entire `NAME=VALUE` line is redacted before downstream
  // patterns (api_key/sk-/ghp_/xoxb-/AKIA/etc.) get a chance to match only
  // the value portion. Two patterns:
  //   (A) UPPER_SNAKE_CASE
  //   (B) lower/camelCase
  // Both require (i) a separator/boundary before the keyword so identifiers
  // like `tokenizer` / `TOKEN_REGEX` don't match, and (ii) an assignment
  // operator `=` or `:`. Bounded quantifiers + negative char classes keep the
  // engine linear (ReDoS-safe). `/i` flag intentionally omitted so case-strict
  // boundaries hold. Leading boundary uses zero-width lookbehind so newlines
  // and separator chars before the assignment are preserved (`"foo\nVAR=..."`
  // becomes `"foo\n[REDACTED]"`, not `"foo[REDACTED]"`).
  /(?<=^|[\s;&|])(?:export\s+)?[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){0,8}_(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|KEY|URL|AUTH|DSN|URI)[A-Z0-9_]{0,32}\s{0,3}[:=]\s{0,3}(?:"[^"\n]{1,256}"|'[^'\n]{1,256}'|[^\s'"`;|&()\[\]{}<>]{4,256})/g,
  /(?<=^|[\s;&|])(?:(?:const|let|var|export)\s+)?[a-z][a-zA-Z0-9]{0,63}(?:[_-]|(?<=[a-z])(?=[A-Z]))(?:[Tt]oken|[Ss]ecret|[Pp]assword|[Cc]redential|[Aa]pi[_-]?[Kk]ey|[Kk]ey|[Uu]rl|[Aa]uth|[Dd]sn|[Uu]ri|[Pp]wd|[Pp]asswd)(?![a-z])[a-zA-Z0-9_-]{0,32}\s{0,3}[:=]\s{0,3}(?:"[^"\n]{1,256}"|'[^'\n]{1,256}'|[^\s'"`;|&()\[\]{}<>]{4,256})/g,
  /(?:api[_-]?key|apikey|secret|token|password)['":\s]*[=:]\s*['"]?([a-zA-Z0-9_\-/.]{16,})/gi,
  /(?:sk|pk|rk|ak)[-_][a-zA-Z0-9]{20,}/g,
  /gh[pousr]_[a-zA-Z0-9_]{36,}/g,
  /xoxb-[0-9]+-[a-zA-Z0-9]+/g,
  /glpat-[a-zA-Z0-9\-_]{20,}/g,
  // AWS Access Key ID
  /AKIA[0-9A-Z]{16}/g,
  // JWT Token (3-part base64url)
  /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g,
  // Database connection strings (any URL with scheme://)
  /(?:mongodb|postgres|postgresql|mysql|redis|amqp):\/\/[^\s'")\]]+/gi,
  // Private key headers
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  // Generic secrets in assignment context (KEY="value" or KEY: value)
  // matches patterns like SECRET_KEY="value", TOKEN="value", PASSWORD: "value"
  // Uses bounded quantifiers to prevent ReDoS
  /(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|APIKEY|AUTH)[\w]{0,30}\s{0,3}[=:]\s{0,3}['"][^'"]{8,128}['"]/gi,
  // GitHub tokens: ghp_ (PAT), gho_ (OAuth), ghu_ (user-to-server), ghs_ (server), ghr_ (refresh) — already covered above by gh[pousr]_
  // Slack tokens (xoxp-, xoxs-, xoxa-, xoxr-)
  /xox[poras]-[A-Za-z0-9-]+/g,
  // Authorization headers (Bearer, Basic, Token)
  /Authorization:\s*(?:Bearer|Basic|Token)\s+[^\s'")\]]{1,512}/gi,
];

export function sanitizeContent(content: string): string {
  let sanitized = content;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const EVENT_TYPE_MAP: Record<string, EventType> = {
  commit: "git_commit",
  change: "git_commit",
  diff: "git_commit",
  session: "session_start",
  session_event: "session_message",
  document: "document_change",
  discussion: "pr_comment",
  review: "pr_comment",
  ci_result: "ci_result",
  decision: "manual_observation",
  learning: "manual_observation",
  problem_solution: "manual_observation",
  capture: "manual_observation",
};

const SOURCE_TYPE_MAP: Record<string, SourceType> = {
  markdown: "markdown",
  "git-history": "git",
  "claude-sessions": "claude_code",
  github: "github",
  obsidian: "markdown",
  cicd: "github",
  slack: "slack",
  notion: "notion",
  capture: "manual",
  "cursor-sessions": "cursor",
};

export function normalizeToKnowledgeData(event: NormalizedEvent): KnowledgeData {
  const codeLocationJson = event.metadata.extra?.filePath
    ? JSON.stringify({
        path: event.metadata.extra.filePath,
        line: event.metadata.extra.line,
        side: event.metadata.extra.side,
      })
    : undefined;

  return {
    filePath: event.sourceUri,
    title: event.title,
    content: sanitizeContent(event.content),
    frontmatter: {
      source_plugin: event.metadata.sourcePlugin,
      source_id: event.metadata.sourceId,
      ...(event.metadata.tags ? { tags: event.metadata.tags } : {}),
    },
    createdAt: event.timestamp.toISOString(),
    ...(codeLocationJson !== undefined ? { codeLocationJson } : {}),
    ...(event.metadata.confidence !== undefined ? { confidence: event.metadata.confidence } : {}),
  };
}

export function normalizeToKnowledgeEvent(event: NormalizedEvent): KnowledgeEvent {
  const sanitized = sanitizeContent(event.content);
  return {
    eventType: EVENT_TYPE_MAP[event.eventType] ?? "manual_observation",
    sourceType: SOURCE_TYPE_MAP[event.metadata.sourcePlugin] ?? "manual",
    sourceId: event.metadata.sourceId,
    sourceUri: event.sourceUri,
    actor: event.metadata.author,
    content: sanitized,
    contentHash: computeContentHash(sanitized),
    occurredAt: event.timestamp.toISOString(),
    metadataJson: event.metadata.extra,
    projectId: event.metadata.project,
  };
}
