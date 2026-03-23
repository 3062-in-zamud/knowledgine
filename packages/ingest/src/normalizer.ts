import { createHash } from "crypto";
import type { KnowledgeData, KnowledgeEvent, SourceType, EventType } from "@knowledgine/core";
import type { NormalizedEvent } from "./types.js";

const SECRET_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|apikey|secret|token|password)['":\s]*[=:]\s*['"]?([a-zA-Z0-9_\-/.]{16,})/gi,
  /(?:sk|pk|rk|ak)[-_][a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /xoxb-[0-9]+-[a-zA-Z0-9]+/g,
  /glpat-[a-zA-Z0-9\-_]{20,}/g,
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
  slack: "slack",
  notion: "notion",
  capture: "manual",
};

export function normalizeToKnowledgeData(event: NormalizedEvent): KnowledgeData {
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
