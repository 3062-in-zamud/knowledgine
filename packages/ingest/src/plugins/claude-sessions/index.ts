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
      yield* this.processFile(filePath);
    }
  }

  async *ingestIncremental(
    sourcePath: SourceURI,
    checkpoint: string
  ): AsyncGenerator<NormalizedEvent> {
    const sinceDate = new Date(checkpoint);
    const jsonlFiles = await this.findJsonlFiles(sourcePath);
    for (const filePath of jsonlFiles) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.mtimeMs >= sinceDate.getTime()) {
          yield* this.processFile(filePath);
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

  private async *processFile(
    filePath: string
  ): AsyncGenerator<NormalizedEvent> {
    const sessionId = basename(filePath, ".jsonl");
    const projectName = basename(dirname(filePath));

    // 全メッセージを収集
    const allMessages: Array<{
      type: "user" | "assistant" | "system";
      timestamp: Date;
      sessionId: string;
      content: string;
      cwd: string;
      gitBranch?: string;
      uuid: string;
    }> = [];

    try {
      for await (const msg of parseSessionFile(filePath)) {
        allMessages.push(msg);
      }
    } catch (err) {
      console.error(`[claude-sessions] Failed to parse ${filePath}:`, err);
      return;
    }

    if (allMessages.length === 0) return;

    const firstMessage = allMessages[0];

    // セッション開始イベント
    yield {
      sourceUri: `claude-session://${projectName}/${sessionId}`,
      eventType: "session",
      title: `Session: ${sessionId}`,
      content: `Project: ${projectName}\nStarted: ${firstMessage.timestamp.toISOString()}`,
      timestamp: firstMessage.timestamp,
      metadata: {
        sourcePlugin: "claude-sessions",
        sourceId: sessionId,
        project: projectName,
      },
    };

    // メッセージイベント
    for (const message of allMessages) {
      const content = message.content;
      yield {
        sourceUri: `claude-session://${projectName}/${sessionId}#${message.uuid}`,
        eventType: "session_event",
        title: `${message.type}: ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`,
        content,
        timestamp: message.timestamp,
        metadata: {
          sourcePlugin: "claude-sessions",
          sourceId: message.uuid,
          author: message.type === "assistant" ? "claude" : "user",
          project: projectName,
          branch: message.gitBranch,
        },
      };
    }
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
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, results);
      } else if (entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  }
}
