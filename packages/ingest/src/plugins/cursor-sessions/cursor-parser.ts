import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sanitizeContent } from "../../normalizer.js";
import type { NormalizedEvent } from "../../types.js";

export interface CursorSessionEntry {
  type: string;
  content: string;
  timestamp: string;
}

function isValidCursorEntry(parsed: unknown): parsed is CursorSessionEntry {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return (
    typeof obj["type"] === "string" &&
    typeof obj["content"] === "string" &&
    typeof obj["timestamp"] === "string"
  );
}

export async function* parseCursorSessionFile(
  filePath: string,
): AsyncGenerator<CursorSessionEntry> {
  const rl = createInterface({ input: createReadStream(filePath) });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // 不正なJSON行はスキップ
        continue;
      }

      if (!isValidCursorEntry(parsed)) continue;

      yield parsed;
    }
  } finally {
    rl.close();
  }
}

export function cursorEntryToNormalizedEvent(
  entries: Array<{ type: string; content: string; timestamp: string }>,
  workspaceHash: string,
  filename: string,
): NormalizedEvent {
  const userMessages = entries
    .filter((e) => e.type === "user")
    .map((e) => e.content.slice(0, 500))
    .join("\n\n---\n\n");

  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];

  const timestamp =
    firstEntry && typeof firstEntry.timestamp === "string"
      ? new Date(firstEntry.timestamp)
      : new Date(0);

  const endedAt =
    lastEntry && typeof lastEntry.timestamp === "string"
      ? new Date(lastEntry.timestamp).toISOString()
      : new Date(0).toISOString();

  const summaryContent = [
    `WorkspaceHash: ${workspaceHash}`,
    `File: ${filename}`,
    `Messages: ${entries.length}`,
    `Started: ${timestamp.toISOString()}`,
    `Ended: ${endedAt}`,
    "",
    "## User Messages",
    "",
    userMessages || "(no user messages)",
  ].join("\n");

  // filename から拡張子を除いたセッションIDを生成
  const sessionId = filename.endsWith(".jsonl") ? filename.slice(0, -6) : filename;

  return {
    sourceUri: `cursor://${workspaceHash}/${filename}`,
    eventType: "session",
    title: `Cursor Session: ${workspaceHash.slice(0, 8)}/${sessionId.slice(0, 8)}`,
    content: sanitizeContent(summaryContent),
    timestamp,
    metadata: {
      sourcePlugin: "cursor-sessions",
      sourceId: sessionId,
      extra: { workspaceHash },
    },
  };
}
