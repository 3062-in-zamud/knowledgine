import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import { EventWriter, sanitizeContent } from "@knowledgine/ingest";
import type { NormalizedEvent } from "@knowledgine/ingest";
import { validateCaptureUrl } from "../lib/url-validator.js";
import { createBox, createTable, symbols } from "../lib/ui/index.js";

export interface CaptureCommandOptions {
  url?: string;
  file?: string;
  tags?: string;
  title?: string;
  path?: string;
  format?: string;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}

function initDb(rootPath: string) {
  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  return { db, repository };
}

/**
 * @deprecated Use captureAddCommand instead
 */
export async function captureCommand(
  text: string | undefined,
  options: CaptureCommandOptions,
): Promise<void> {
  return captureAddCommand(text, options);
}

export async function captureAddCommand(
  text: string | undefined,
  options: CaptureCommandOptions,
): Promise<void> {
  // 1. DB初期化
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error("Error: Knowledge base not initialized.\n  Run: knowledgine init --path <dir>");
    process.exitCode = 1;
    return;
  }

  // 2. 入力ソース判定（排他）
  let content: string;
  let sourceUri: string;
  let sourceType: string;

  if (text) {
    content = text;
    sourceUri = "capture://text";
    sourceType = "text";
  } else if (options.url) {
    try {
      const parsed = validateCaptureUrl(options.url);
      const response = await fetch(parsed.href);
      if (!response.ok) {
        console.error(`Error: Failed to fetch URL: ${response.status} ${response.statusText}`);
        process.exitCode = 1;
        return;
      }
      content = await response.text();
      sourceUri = parsed.href;
      sourceType = "url";
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }
  } else if (options.file) {
    const filePath = resolve(options.file);
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }
    content = readFileSync(filePath, "utf-8");
    sourceUri = `file://${filePath}`;
    sourceType = "file";
  } else if (!process.stdin.isTTY) {
    content = await readStdin();
    if (!content.trim()) {
      console.error("Error: No input provided. Provide text, --url, --file, or pipe via stdin.");
      process.exitCode = 1;
      return;
    }
    sourceUri = "capture://stdin";
    sourceType = "stdin";
  } else {
    console.error("Error: No input provided. Provide text, --url, --file, or pipe via stdin.");
    process.exitCode = 1;
    return;
  }

  // 3. タイトルとタグ
  const title = options.title || content.slice(0, 50).replace(/\n/g, " ").trim();
  const tags = options.tags
    ? options.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  // 4. NormalizedEvent構築
  const event: NormalizedEvent = {
    sourceUri,
    eventType: "capture",
    title,
    content: sanitizeContent(content),
    timestamp: new Date(),
    metadata: {
      sourcePlugin: "capture",
      sourceId: `capture-${Date.now()}`,
      tags: tags.length > 0 ? tags : undefined,
    },
  };

  // 5. DB書き込み
  const { db, repository } = initDb(rootPath);
  try {
    const writer = new EventWriter(db, repository);
    const result = writer.writeEvent(event);

    // 6. 出力
    const format = options.format ?? "plain";
    if (format === "json") {
      console.log(
        JSON.stringify({
          ok: true,
          command: "capture",
          result: {
            id: result.id,
            title,
            tags,
            sourceUri,
          },
        }),
      );
    } else {
      const lines = [`${symbols.success} Captured (id: ${result.id})`, `  Title: ${title}`];
      if (tags.length > 0) {
        lines.push(`  Tags:  ${tags.join(", ")}`);
      }
      lines.push(`  Source: ${sourceType} (manual)`);
      console.error(createBox(lines.join("\n"), { title: "Captured" }));
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export interface CaptureListOptions {
  path?: string;
  format?: string;
}

export async function captureListCommand(options: CaptureListOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error("Error: Knowledge base not initialized.\n  Run: knowledgine init --path <dir>");
    process.exitCode = 1;
    return;
  }

  const { db, repository } = initDb(rootPath);
  try {
    const notes = repository.getNotesWithPrefix("capture://");
    const format = options.format ?? "plain";

    if (format === "json") {
      console.log(
        JSON.stringify({
          ok: true,
          command: "capture list",
          result: notes.map((n) => ({
            id: n.id,
            title: n.title,
            filePath: n.file_path,
            createdAt: n.created_at,
          })),
        }),
      );
    } else {
      if (notes.length === 0) {
        console.error("No captured notes found.");
        return;
      }
      const rows = notes.map((n) => [String(n.id), n.title, n.file_path, n.created_at]);
      console.error(createTable({ head: ["ID", "Title", "Source", "Created"], rows }));
    }
  } finally {
    db.close();
  }
}

export interface CaptureDeleteOptions {
  path?: string;
}

export async function captureDeleteCommand(
  idStr: string,
  options: CaptureDeleteOptions,
): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error("Error: Knowledge base not initialized.\n  Run: knowledgine init --path <dir>");
    process.exitCode = 1;
    return;
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id) || id <= 0) {
    console.error(`Error: Invalid ID: ${idStr}`);
    process.exitCode = 1;
    return;
  }

  const { db, repository } = initDb(rootPath);
  try {
    const note = repository.getNoteById(id);
    if (!note) {
      console.error(`${symbols.error} Error: Note #${id} not found.`);
      process.exitCode = 1;
      return;
    }

    if (!note.file_path.startsWith("capture://")) {
      console.error(
        `${symbols.error} Error: Note #${id} is not a captured note (file_path: ${note.file_path}). Only capture:// notes can be deleted with this command.`,
      );
      process.exitCode = 1;
      return;
    }

    const deleted = repository.deleteNoteById(id);
    if (deleted) {
      console.error(`${symbols.success} Deleted captured note #${id}: ${note.title}`);
    } else {
      console.error(`${symbols.error} Error: Failed to delete note #${id}.`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
