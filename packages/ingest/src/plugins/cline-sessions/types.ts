/**
 * Subset of Cline's HistoryItem (state/taskHistory.json entries) used by the
 * ingest plugin. Wider fields exist upstream but we only consume what is
 * needed for title/timestamp/metadata. Fields are optional so the parser
 * tolerates schema drift between Cline minor versions.
 *
 * Source of truth (pinned): https://github.com/cline/cline/blob/v3.81.0/src/shared/HistoryItem.ts
 */
export interface ClineHistoryItem {
  id: string;
  ulid?: string;
  ts?: number;
  task?: string;
  tokensIn?: number;
  tokensOut?: number;
  totalCost?: number;
  size?: number;
  cwdOnTaskInitialization?: string;
  modelId?: string;
}

export function isClineHistoryItem(x: unknown): x is ClineHistoryItem {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o["id"] === "string" && o["id"].length > 0;
}

/**
 * Anthropic SDK MessageParam shape (relaxed for runtime parsing).
 * Cline persists api_conversation_history.json as `Anthropic.MessageParam[]`.
 */
export interface ClineApiMessage {
  role: "user" | "assistant" | string;
  content: string | Array<{ type: string; text?: string; [k: string]: unknown }>;
}

export function isClineApiMessage(x: unknown): x is ClineApiMessage {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o["role"] !== "string") return false;
  return "content" in o;
}

/**
 * Normalised message yielded by `parseClineTask` and consumed by the plugin
 * to build a per-task summary event.
 */
export interface ClineNormalizedMessage {
  role: "user" | "assistant";
  timestamp: Date;
  content: string;
}

export interface ParseResult {
  messages: ClineNormalizedMessage[];
  /**
   * If set, the caller should emit a single stderr warning of the form
   * `⚠ Skipped (<basename>): <skipReason>` and not produce an event for
   * this task.
   */
  skipReason?: string;
}
