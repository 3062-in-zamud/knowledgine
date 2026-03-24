import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import os from "node:os";
import type {
  IngestPlugin,
  PluginManifest,
  TriggerConfig,
  PluginConfig,
  PluginInitResult,
  NormalizedEvent,
  SourceURI,
} from "../../types.js";
import { parseCursorSessionFile, cursorEntryToNormalizedEvent } from "./cursor-parser.js";

function getCursorStorageDir(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Application Support", "Cursor", "User", "workspaceStorage");
    case "linux":
      return join(home, ".config", "Cursor", "User", "workspaceStorage");
    case "win32": {
      const appData = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
      return join(appData, "Cursor", "User", "workspaceStorage");
    }
    default:
      return join(home, ".config", "Cursor", "User", "workspaceStorage");
  }
}

export class CursorSessionsPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "cursor-sessions",
    name: "Cursor IDE Sessions",
    version: "0.1.0",
    schemes: ["cursor://"],
    priority: 1,
  };

  readonly triggers: TriggerConfig[] = [
    { type: "file_watcher" as const, paths: ["**/*.jsonl"] },
    { type: "manual" as const },
  ];

  async initialize(_config?: PluginConfig): Promise<PluginInitResult> {
    // Cursorがインストールされていなくても正常終了
    return { ok: true };
  }

  async *ingestAll(sourceUri: SourceURI): AsyncGenerator<NormalizedEvent> {
    const storageDir = sourceUri || getCursorStorageDir();
    const jsonlFiles = await this.findJsonlFiles(storageDir);
    for (const { filePath, workspaceHash, filename } of jsonlFiles) {
      const event = await this.processFile(filePath, workspaceHash, filename);
      if (event) yield event;
    }
  }

  async *ingestIncremental(
    sourceUri: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    const storageDir = sourceUri || getCursorStorageDir();
    const sinceDate = new Date(checkpoint);
    const jsonlFiles = await this.findJsonlFiles(storageDir);
    for (const { filePath, workspaceHash, filename } of jsonlFiles) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.mtimeMs >= sinceDate.getTime()) {
          const event = await this.processFile(filePath, workspaceHash, filename);
          if (event) yield event;
        }
      } catch {
        // ファイルアクセスエラーはスキップ
      }
    }
  }

  async getCurrentCheckpoint(sourceUri: SourceURI): Promise<string> {
    const storageDir = sourceUri || getCursorStorageDir();
    const jsonlFiles = await this.findJsonlFiles(storageDir);

    if (jsonlFiles.length === 0) {
      return new Date(0).toISOString();
    }

    let latestMtime = 0;
    for (const { filePath } of jsonlFiles) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.mtimeMs > latestMtime) {
          latestMtime = fileStat.mtimeMs;
        }
      } catch {
        // スキップ
      }
    }

    return latestMtime > 0 ? new Date(latestMtime).toISOString() : new Date(0).toISOString();
  }

  async dispose(): Promise<void> {
    // no-op
  }

  private async processFile(
    filePath: string,
    workspaceHash: string,
    filename: string,
  ): Promise<NormalizedEvent | null> {
    const entries: Array<{ type: string; content: string; timestamp: string }> = [];

    try {
      for await (const entry of parseCursorSessionFile(filePath)) {
        entries.push(entry);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`  Skipped (error): ${filename}: ${msg}\n`);
      }
      return null;
    }

    if (entries.length === 0) return null;

    return cursorEntryToNormalizedEvent(entries, workspaceHash, filename);
  }

  private async findJsonlFiles(
    dir: string,
  ): Promise<Array<{ filePath: string; workspaceHash: string; filename: string }>> {
    const results: Array<{ filePath: string; workspaceHash: string; filename: string }> = [];
    try {
      // workspaceStorage の構造: {dir}/{workspaceHash}/*.jsonl
      const hashDirs = await readdir(dir, { withFileTypes: true });
      for (const hashEntry of hashDirs) {
        if (!hashEntry.isDirectory()) continue;
        const workspaceHash = hashEntry.name;
        const hashDir = join(dir, workspaceHash);
        let files;
        try {
          files = await readdir(hashDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const fileEntry of files) {
          if (fileEntry.isFile() && fileEntry.name.endsWith(".jsonl")) {
            results.push({
              filePath: join(hashDir, fileEntry.name),
              workspaceHash,
              filename: basename(fileEntry.name),
            });
          }
        }
      }
    } catch {
      // ディレクトリが存在しない場合は0件で正常終了
    }
    return results;
  }
}
