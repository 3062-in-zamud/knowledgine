import { resolve } from "path";
import { existsSync } from "fs";
import {
  loadConfig,
  loadRcFile,
  resolveDefaultPath,
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
  checkSemanticReadiness,
  CrossProjectSearcher,
} from "@knowledgine/core";
import type { EmbeddingProvider } from "@knowledgine/core";
import { getDemoNotesPath } from "./demo.js";
import {
  formatSearchResults as formatToolSearchResults,
  formatRelatedNotes,
} from "../lib/formatter.js";
import type { OutputFormat } from "../lib/formatter.js";
import { colors, symbols } from "../lib/ui/index.js";

export interface SearchCommandOptions {
  demo?: boolean;
  mode?: string;
  limit?: number;
  format?: string;
  related?: string;
  relatedFile?: string;
  path?: string;
  fallback?: boolean;
  agentic?: boolean;
  includeDeprecated?: boolean;
  projects?: string;
}

export async function searchCommand(query: string, options: SearchCommandOptions): Promise<void> {
  // Validate query
  if (!query || !query.trim()) {
    console.error("Error: Search query cannot be empty.");
    console.error('Usage: knowledgine search "your query" [--mode keyword|semantic|hybrid]');
    process.exitCode = 1;
    return;
  }

  // Validate mode
  const validModes = ["keyword", "semantic", "hybrid"];
  if (options.mode && !validModes.includes(options.mode)) {
    console.error(`Error: Invalid search mode "${options.mode}".`);
    console.error(`Valid modes: ${validModes.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const fallbackAllowed = options.fallback !== false;
  const rootPath = options.demo ? getDemoNotesPath() : resolveDefaultPath(options.path);

  // --projects: クロスプロジェクト横断検索
  if (options.projects) {
    const rcConfig = loadRcFile(rootPath);
    const requestedNames = new Set(
      options.projects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const projectsConfig = rcConfig?.projects ?? [];
    const projectsToSearch = projectsConfig.filter((p) => requestedNames.has(p.name));

    if (projectsToSearch.length === 0) {
      console.error(
        `No matching projects found for: ${options.projects}. Check your .knowledginerc projects config.`,
      );
      process.exitCode = 1;
      return;
    }

    const format = (options.format as "json" | "table" | "plain") ?? "plain";
    const limit = options.limit ?? 20;
    const searcher = new CrossProjectSearcher(projectsToSearch);
    try {
      const results = await searcher.search(query, { limit });
      if (format === "json") {
        console.log(JSON.stringify({ ok: true, command: "search", crossProject: true, results }));
      } else {
        if (results.length === 0) {
          console.error(
            `${symbols.info} ${colors.hint(`No cross-project results for "${query}".`)}`,
          );
        } else {
          console.error(
            colors.bold(`Cross-project results for "${query}" (${results.length} matches):`),
          );
          console.error("");
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            console.error(`  ${i + 1}. [${r.score.toFixed(2)}] [${r.projectName}] ${r.title}`);
            console.error(`     ${r.content.slice(0, 80).replace(/\n/g, " ")}`);
            console.error("");
          }
        }
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    return;
  }

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

    // Dynamic default mode: hybrid when embeddings available, keyword otherwise
    let mode: "keyword" | "semantic" | "hybrid";
    if (options.mode) {
      mode = options.mode as "keyword" | "semantic" | "hybrid";
    } else {
      // Check if embeddings are available for dynamic default
      const modelManager = new ModelManager();
      const semanticReadiness = checkSemanticReadiness(config, modelManager, repository);
      mode = semanticReadiness.ready ? "hybrid" : "keyword";
    }
    const limit = options.limit ?? 20;
    const format = (options.format as OutputFormat) ?? "plain";

    // --related / --related-file: findRelated モード
    if (options.related || options.relatedFile) {
      const service = new KnowledgeService({ repository, rootPath, graphRepository });
      let noteId: number | undefined;
      let entityName: string | undefined;
      if (options.related) {
        const parsed = parseInt(options.related, 10);
        if (!isNaN(parsed) && parsed > 0 && String(parsed) === options.related) {
          noteId = parsed;
        } else {
          entityName = options.related;
        }
      }
      try {
        const result = await service.findRelated({
          noteId,
          entityName,
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

    // Initialize embedding provider if semantic is enabled, model is available, and embeddings exist
    let embeddingProvider: EmbeddingProvider | undefined;
    if (mode !== "keyword") {
      const modelManager = new ModelManager();
      const semanticReadiness = checkSemanticReadiness(config, modelManager, repository);
      if (semanticReadiness.ready) {
        embeddingProvider = new OnnxEmbeddingProvider(DEFAULT_MODEL_NAME, modelManager);
      }
    }

    // --no-fallback: semantic/hybrid が利用できない場合はエラー終了
    const semanticUnavailable =
      mode !== "keyword" && (!config.embedding?.enabled || !embeddingProvider);
    if (!fallbackAllowed && semanticUnavailable) {
      console.error(
        `${symbols.error} ${colors.error(`${mode} search is not available and --no-fallback was specified.`)}`,
      );
      console.error(
        `${symbols.arrow} ${colors.hint("Run 'knowledgine upgrade --semantic' to enable semantic search.")}`,
      );
      process.exitCode = 1;
      return;
    }

    // 通常の検索モード
    const service = new KnowledgeService({
      repository,
      rootPath,
      graphRepository,
      embeddingProvider,
    });
    const result = await service.search({
      query,
      limit,
      mode,
      agentic: options.agentic,
      includeDeprecated: options.includeDeprecated,
    });

    // Fallback notification using fallbackInfo (KNOW-378)
    const fallbackResult = result.results.find((r) => r.fallbackInfo);
    if (fallbackResult?.fallbackInfo) {
      const info = fallbackResult.fallbackInfo;
      console.error("");
      console.error(
        `  ${symbols.warning} ${colors.warning(`${info.originalMode} search unavailable — falling back to ${info.modeUsed} search.`)}`,
      );
      console.error(`    Reason: ${info.reason}`);
      if (info.modeUsed === "keyword") {
        console.error(`    Fix:    ${colors.hint("knowledgine ingest --all --path .")}`);
      }
      console.error("");
    } else if (semanticUnavailable) {
      console.error(
        `${symbols.warning} ${colors.warning("Semantic search is not configured. Falling back to FTS5.")}`,
      );
      console.error(
        `${symbols.arrow} ${colors.hint("Run 'knowledgine upgrade --semantic' to enable semantic search.")}`,
      );
      console.error("");
    }

    if (format === "json") {
      console.log(JSON.stringify({ ok: true, command: "search", result }));
    } else if (format === "table") {
      if (result.results.length === 0) {
        console.error(`${symbols.info} ${colors.hint(`No results for "${query}".`)}`);
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
  results: Array<{ score: number; filePath: string; title: string; snippet?: string }>,
): void {
  if (results.length === 0) {
    console.error(`${symbols.info} ${colors.hint(`No results for "${query}".`)}`);
    return;
  }

  console.error(colors.bold(`Results for "${query}" (${results.length} matches):`));
  console.error("");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = r.score.toFixed(2);
    console.error(`  ${i + 1}. [${score}] ${r.filePath}`);
    console.error(`     ${r.title}`);
    if (r.snippet) {
      // Convert Unicode markers to * for plain text highlighting
      const displaySnippet = r.snippet.replace(/\uFFF0/g, "*").replace(/\uFFF1/g, "*");
      console.error(`     ${displaySnippet}`);
    }
    console.error("");
  }
}

/** @deprecated Use searchCommand with format option instead */
export function formatSearchResults(
  query: string,
  results: Array<{ note: unknown; score: number }>,
): void {
  if (results.length === 0) {
    console.error(`${symbols.info} ${colors.hint(`No results for "${query}".`)}`);
    return;
  }

  console.error(colors.bold(`Results for "${query}" (${results.length} matches):`));
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
