import { open, stat } from "node:fs/promises";
import { join } from "node:path";
import { extractTextContent } from "../../shared/text-extractor.js";
import {
  isClineApiMessage,
  isClineHistoryItem,
  type ClineApiMessage,
  type ClineHistoryItem,
  type ClineNormalizedMessage,
  type ParseResult,
} from "./types.js";

/**
 * Hard cap on the size of a single Cline JSON file we will parse.
 * Cline's long-running tasks can balloon `api_conversation_history.json`
 * past 10MB. `JSON.parse` materialises the full string, so larger files
 * are skipped with a stderr warning rather than risk Node heap pressure.
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const FILE_NAMES = {
  api: "api_conversation_history.json",
  ui: "ui_messages.json",
  metadata: "task_metadata.json",
} as const;

/**
 * Read and JSON-parse a file with TOCTOU-safe size enforcement.
 *
 * Strategy: open() once and operate exclusively on the resulting file
 * handle. fh.stat() and fh.read() share the same inode, so the size
 * check and the read cannot race against an external rename/grow
 * (CodeQL js/file-system-race compliant). After reading, re-check the
 * actual byte length as a belt-and-suspenders bound.
 */
async function readJsonFile(filePath: string): Promise<{ data?: unknown; skipReason?: string }> {
  let fh: Awaited<ReturnType<typeof open>>;
  try {
    fh = await open(filePath, "r");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { skipReason: "missing" };
    return { skipReason: `open: ${code ?? "unknown"}` };
  }
  try {
    const s = await fh.stat();
    if (s.size > MAX_FILE_SIZE) {
      return { skipReason: `file too large (>${MAX_FILE_SIZE / 1024 / 1024}MB)` };
    }
    const buffer = Buffer.alloc(s.size);
    if (s.size > 0) {
      await fh.read(buffer, 0, s.size, 0);
    }
    // Defensive: if anything went wrong with the size accounting (sparse
    // files, races during open() before we got the handle), still bound
    // the materialised string.
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return { skipReason: `file too large (>${MAX_FILE_SIZE / 1024 / 1024}MB)` };
    }
    const raw = buffer.toString("utf8");
    try {
      return { data: JSON.parse(raw) };
    } catch {
      return { skipReason: "parse error" };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { skipReason: `read: ${code ?? "unknown"}` };
  } finally {
    await fh.close().catch(() => {
      /* ignore close errors */
    });
  }
}

function normaliseApiMessages(parsed: unknown): ClineNormalizedMessage[] {
  if (!Array.isArray(parsed)) return [];
  const out: ClineNormalizedMessage[] = [];
  for (const entry of parsed) {
    if (!isClineApiMessage(entry)) continue;
    const role = entry.role === "user" || entry.role === "assistant" ? entry.role : null;
    if (!role) continue;
    const content = extractTextContent(
      entry.content as string | Array<{ type: string; text?: string }>,
    );
    if (!content) continue;
    out.push({ role, timestamp: new Date(0), content });
  }
  return out;
}

function normaliseUiMessages(parsed: unknown): ClineNormalizedMessage[] {
  if (!Array.isArray(parsed)) return [];
  const out: ClineNormalizedMessage[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const o = entry as Record<string, unknown>;
    const text = typeof o["text"] === "string" ? (o["text"] as string) : "";
    if (!text) continue;
    const ts = typeof o["ts"] === "number" ? (o["ts"] as number) : 0;
    // Cline UI uses "say" for assistant-side and "ask" for user-side prompts.
    // This is a coarse approximation used only when api_conversation_history is absent.
    const role: "user" | "assistant" = o["type"] === "ask" ? "user" : "assistant";
    out.push({ role, timestamp: new Date(ts), content: text });
  }
  return out;
}

/** Skip reasons that indicate the api file should be treated as a hard
 * stop (no ui fallback). Heap-protection skip is the canonical example: if
 * the api file is oversized we must not also load the ui file, which is
 * frequently larger and would defeat the >10MB guard. */
function isHardSkipReason(reason: string | undefined): boolean {
  if (!reason) return false;
  return reason.startsWith("file too large");
}

/**
 * Parse the per-task JSON files produced by Cline 3.x.
 *
 * Strategy:
 *   1. Prefer `api_conversation_history.json` (Anthropic standard format).
 *   2. Fall back to `ui_messages.json` only when the api file is missing or
 *      malformed. UI messages drop tool details but preserve the conversation.
 *   3. Hard-stop skip reasons (e.g. >10MB heap protection) short-circuit
 *      without touching ui — falling back to a similarly large ui file would
 *      defeat the guard.
 *   4. If both are unavailable/malformed, return `{ messages: [], skipReason }`
 *      so the caller can emit a single stderr warning.
 */
export async function parseClineTask(taskDir: string): Promise<ParseResult> {
  const apiResult = await readJsonFile(join(taskDir, FILE_NAMES.api));
  if (isHardSkipReason(apiResult.skipReason)) {
    return { messages: [], skipReason: `api: ${apiResult.skipReason}` };
  }
  if (apiResult.data !== undefined) {
    const messages = normaliseApiMessages(apiResult.data);
    if (messages.length > 0) return { messages };
    // api file existed but yielded no messages — still attempt ui fallback.
  }

  const uiResult = await readJsonFile(join(taskDir, FILE_NAMES.ui));
  if (uiResult.data !== undefined) {
    const messages = normaliseUiMessages(uiResult.data);
    if (messages.length > 0) return { messages };
  }

  // Neither file usable — pick the most informative skip reason.
  const reason =
    apiResult.skipReason && apiResult.skipReason !== "missing"
      ? `api: ${apiResult.skipReason}`
      : uiResult.skipReason && uiResult.skipReason !== "missing"
        ? `ui: ${uiResult.skipReason}`
        : "no parseable conversation files";
  return { messages: [], skipReason: reason };
}

/**
 * Read `<storageDir>/state/taskHistory.json` and return entries that look
 * like `HistoryItem` (id is a non-empty string). Always returns an array;
 * never throws. Drift-tolerant: unknown fields on individual items are
 * silently passed through.
 */
export async function readTaskHistory(storageDir: string): Promise<ClineHistoryItem[]> {
  const result = await readJsonFile(join(storageDir, "state", "taskHistory.json"));
  if (!Array.isArray(result.data)) return [];
  const out: ClineHistoryItem[] = [];
  for (const entry of result.data) {
    if (isClineHistoryItem(entry)) out.push(entry);
  }
  return out;
}

/**
 * Compute the maximum mtime (ms) across the three Cline per-task files.
 * Used for incremental ingest: a task is considered "updated since
 * checkpoint" when any of its files has been written more recently.
 */
export async function maxTaskMtime(taskDir: string): Promise<number> {
  const candidates = [FILE_NAMES.api, FILE_NAMES.ui, FILE_NAMES.metadata].map((f) =>
    join(taskDir, f),
  );
  const results = await Promise.all(
    candidates.map((p) =>
      stat(p)
        .then((s) => s.mtimeMs)
        .catch(() => 0),
    ),
  );
  return Math.max(0, ...results);
}

/**
 * Re-export for tests / callers that want the raw type-guards.
 */
export { isClineApiMessage, isClineHistoryItem };
export type { ClineApiMessage };
