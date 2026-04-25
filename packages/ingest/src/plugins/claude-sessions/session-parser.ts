import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { extractTextContent } from "../../shared/text-extractor.js";

// Re-export for downstream callers (tests, other plugins) that import
// extractTextContent through this module.
export { extractTextContent } from "../../shared/text-extractor.js";

export interface SessionMessage {
  type: "user" | "assistant" | "system";
  timestamp: Date;
  sessionId: string;
  content: string;
  cwd: string;
  gitBranch?: string;
  uuid: string;
}

function isValidEntry(
  parsed: unknown,
): parsed is { type: string; uuid: string; [key: string]: unknown } {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return typeof obj["type"] === "string" && typeof obj["uuid"] === "string";
}

export function isRelevantEntry(entry: { type: string }): boolean {
  return entry.type === "user" || entry.type === "assistant" || entry.type === "system";
}

export async function* parseSessionFile(filePath: string): AsyncGenerator<SessionMessage> {
  const rl = createInterface({ input: createReadStream(filePath) });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // 破損行はスキップ
        continue;
      }

      if (!isValidEntry(parsed)) continue;
      if (!isRelevantEntry(parsed)) continue;

      const entry = parsed as Record<string, unknown>;

      // content フィールド抽出
      const rawContent =
        entry["message"] != null
          ? (entry["message"] as Record<string, unknown>)["content"]
          : entry["content"];

      const contentInput = rawContent as string | Array<{ type: string; text?: string }>;
      const content = extractTextContent(contentInput ?? "");
      if (!content) continue;

      const type = parsed.type as "user" | "assistant" | "system";
      const uuid = parsed.uuid;

      // timestamp
      const rawTs = entry["timestamp"] ?? entry["ts"];
      const timestamp =
        typeof rawTs === "string" || typeof rawTs === "number" ? new Date(rawTs) : new Date(0);

      // cwd
      const cwd = typeof entry["cwd"] === "string" ? entry["cwd"] : "";

      // gitBranch
      const gitBranch = typeof entry["gitBranch"] === "string" ? entry["gitBranch"] : undefined;

      // sessionId: エントリから取得できる場合、なければ空文字
      const sessionId = typeof entry["sessionId"] === "string" ? entry["sessionId"] : "";

      yield {
        type,
        timestamp,
        sessionId,
        content,
        cwd,
        gitBranch,
        uuid,
      };
    }
  } finally {
    rl.close();
  }
}
