import { resolve } from "path";
import { existsSync } from "fs";
import {
  loadConfig,
  createDatabase,
  loadSqliteVecExtension,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  KnowledgeService,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
  DEFAULT_MODEL_NAME,
} from "@knowledgine/core";
import type { EmbeddingProvider } from "@knowledgine/core";
import { getDemoNotesPath } from "./demo.js";
import {
  formatSearchResults as formatToolSearchResults,
  formatRelatedNotes,
} from "../lib/formatter.js";
import type { OutputFormat } from "../lib/formatter.js";

export interface SearchCommandOptions {
  demo?: boolean;
  mode?: string;
  limit?: number;
  format?: string;
  related?: string;
  relatedFile?: string;
  path?: string;
}

export async function searchCommand(query: string, options: SearchCommandOptions): Promise<void> {
  const rootPath = options.demo
    ? getDemoNotesPath()
    : options.path
      ? resolve(options.path)
      : resolve(process.cwd());

  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(
      options.demo
        ? 'Demo not initialized. Run "knowledgine init --demo" first.'
        : 'Not initialized. Run "knowledgine init --path <dir>" first.',
    );
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);

  try {
    if (config.embedding?.enabled) {
      await loadSqliteVecExtension(db);
    }
    new Migrator(db, ALL_MIGRATIONS).migrate();

    const repository = new KnowledgeRepository(db);
    const graphRepository = new GraphRepository(db);

    const mode = (options.mode as "keyword" | "semantic" | "hybrid") ?? "keyword";
    const limit = options.limit ?? 20;
    const format = (options.format as OutputFormat) ?? "plain";

    // --related / --related-file: findRelated モード
    if (options.related || options.relatedFile) {
      const service = new KnowledgeService({ repository, rootPath, graphRepository });
      const noteId = options.related ? parseInt(options.related, 10) : undefined;
      if (options.related && (isNaN(noteId!) || noteId! < 1)) {
        console.error("Error: --related must be a positive integer (note ID)");
        process.exitCode = 1;
        return;
      }
      try {
        const result = await service.findRelated({
          noteId,
          filePath: options.relatedFile,
          limit,
        });
        if (format === "json") {
          console.log(JSON.stringify({ ok: true, command: "search", result }));
        } else {
          console.error(formatRelatedNotes(result, format === "table" ? "table" : "plain"));
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
      return;
    }

    // Initialize embedding provider if semantic is enabled and requested
    let embeddingProvider: EmbeddingProvider | undefined;
    if (mode !== "keyword" && config.embedding?.enabled) {
      const modelManager = new ModelManager();
      if (modelManager.isModelAvailable()) {
        embeddingProvider = new OnnxEmbeddingProvider(DEFAULT_MODEL_NAME, modelManager);
      }
    }

    // 通常の検索モード
    const service = new KnowledgeService({
      repository,
      rootPath,
      graphRepository,
      embeddingProvider,
    });
    const result = await service.search({ query, limit, mode });

    const warnings = result.results.flatMap((r) =>
      r.matchReason.filter((m) => m.startsWith("Warning:")),
    );
    if (warnings.length > 0) {
      console.error(`\n⚠ ${warnings[0]}\n`);
    }

    if (format === "json") {
      console.log(JSON.stringify({ ok: true, command: "search", result }));
    } else if (format === "table") {
      if (result.results.length === 0) {
        console.error(`No results for "${query}".`);
      } else {
        console.error(formatToolSearchResults(result.results, "table"));
      }
    } else {
      // plain (default) - 後方互換の出力形式
      formatLegacySearchResults(query, result.results);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

/** 後方互換のためのレガシー出力形式 */
function formatLegacySearchResults(
  query: string,
  results: Array<{ score: number; filePath: string; title: string }>,
): void {
  if (results.length === 0) {
    console.error(`No results for "${query}".`);
    return;
  }

  console.error(`Results for "${query}" (${results.length} matches):`);
  console.error("");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = r.score.toFixed(2);
    console.error(`  ${i + 1}. [${score}] ${r.filePath}`);
    console.error(`     ${r.title}`);
    console.error("");
  }
}

/** @deprecated Use searchCommand with format option instead */
export function formatSearchResults(
  query: string,
  results: Array<{ note: unknown; score: number }>,
): void {
  if (results.length === 0) {
    console.error(`No results for "${query}".`);
    return;
  }

  console.error(`Results for "${query}" (${results.length} matches):`);
  console.error("");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = r.score.toFixed(2);
    const note = r.note as unknown as { file_path: string; title: string };
    console.error(`  ${i + 1}. [${score}] ${note.file_path}`);
    console.error(`     ${note.title}`);
    console.error("");
  }
}
