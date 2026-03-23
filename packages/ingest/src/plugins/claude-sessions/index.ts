import { readdir, stat } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import type {
  IngestPlugin,
  PluginManifest,
  TriggerConfig,
  PluginConfig,
  PluginInitResult,
  NormalizedEvent,
  SourceURI,
} from "../../types.js";
import { parseSessionFile } from "./session-parser.js";
import { sanitizeContent } from "../../normalizer.js";

/**
 * Maximum number of messages to include in a session summary.
 * Prevents excessively large notes from very long sessions.
 */
const MAX_MESSAGES_PER_SESSION = 200;

export class ClaudeSessionsPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "claude-sessions",
    name: "Claude Code Sessions",
    version: "0.1.0",
    schemes: ["claude-session://"],
    priority: 1,
  };

  readonly triggers: TriggerConfig[] = [
    { type: "file_watcher", paths: ["~/.claude/projects/**/*.jsonl"] },
  ];

  async initialize(_config?: PluginConfig): Promise<PluginInitResult> {
    return { ok: true };
  }

  async *ingestAll(sourcePath: SourceURI): AsyncGenerator<NormalizedEvent> {
    const jsonlFiles = await this.findJsonlFiles(sourcePath);
    for (const filePath of jsonlFiles) {
      const event = await this.processFileToSummary(filePath);
      if (event) yield event;
    }
  }

  async *ingestIncremental(
    sourcePath: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    const sinceDate = new Date(checkpoint);
    const jsonlFiles = await this.findJsonlFiles(sourcePath);
    for (const filePath of jsonlFiles) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.mtimeMs >= sinceDate.getTime()) {
          const event = await this.processFileToSummary(filePath);
          if (event) yield event;
        }
      } catch {
        // ファイルアクセスエラーはスキップ
      }
    }
  }

  async getCurrentCheckpoint(_sourcePath: SourceURI): Promise<string> {
    return new Date().toISOString();
  }

  async dispose(): Promise<void> {
    // no-op
  }

  /**
   * Process a session file into a single summary NormalizedEvent.
   * Instead of yielding one event per message, we consolidate the entire
   * session into one note for better search quality and performance.
   */
  private async processFileToSummary(filePath: string): Promise<NormalizedEvent | null> {
    const sessionId = basename(filePath, ".jsonl");
    const projectName = basename(dirname(filePath));

    const allMessages: Array<{
      type: "user" | "assistant" | "system";
      timestamp: Date;
      content: string;
      uuid: string;
    }> = [];

    try {
      for await (const msg of parseSessionFile(filePath)) {
        allMessages.push(msg);
        if (allMessages.length >= MAX_MESSAGES_PER_SESSION) break;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES") {
        process.stderr.write(`  ⚠ Skipped (permission denied): ${filePath}\n`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`  ⚠ Skipped (parse error): ${basename(filePath)}: ${msg}\n`);
      }
      return null;
    }

    if (allMessages.length === 0) return null;

    const firstMessage = allMessages[0];
    const lastMessage = allMessages[allMessages.length - 1];

    // Build a summary content from user messages (most relevant for search)
    const userMessages = allMessages
      .filter((m) => m.type === "user")
      .map((m) => m.content.slice(0, 500)) // Truncate long messages
      .join("\n\n---\n\n");

    const summaryContent = [
      `Project: ${projectName}`,
      `Session: ${sessionId}`,
      `Messages: ${allMessages.length}`,
      `Started: ${firstMessage.timestamp.toISOString()}`,
      `Ended: ${lastMessage.timestamp.toISOString()}`,
      "",
      "## User Messages",
      "",
      userMessages || "(no user messages)",
    ].join("\n");

    return {
      sourceUri: `claude-session://${projectName}/${sessionId}`,
      eventType: "capture",
      title: `Session: ${projectName}/${sessionId.slice(0, 8)}`,
      content: sanitizeContent(summaryContent),
      timestamp: firstMessage.timestamp,
      metadata: {
        sourcePlugin: "claude-sessions",
        sourceId: sessionId,
        project: projectName,
      },
    };
  }

  private async findJsonlFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      await this.walkDir(dir, results);
    } catch {
      // ディレクトリが存在しない場合などは0件で正常終了
    }
    return results;
  }

  private async walkDir(dir: string, results: string[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "subagents") continue; // Skip subagent sessions
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, results);
      } else if (entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  }
}
