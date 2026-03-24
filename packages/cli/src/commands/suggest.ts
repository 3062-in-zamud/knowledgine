import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  KnowledgeService,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import type { FindRelatedResult, SearchKnowledgeResult } from "@knowledgine/core";
import type { Command } from "commander";

export interface SuggestCommandOptions {
  context?: string;
  file?: string;
  format?: string;
  limit?: string;
  path?: string;
}

function formatSuggestPlain(
  query: string,
  result: SearchKnowledgeResult,
  pspMap: Map<number, FindRelatedResult>,
): string {
  const lines: string[] = [];

  if (result.results.length === 0) {
    return "No related patterns found. Try adding more knowledge to your base.";
  }

  lines.push(`Suggestions for "${query}":`);
  lines.push("");

  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i];
    lines.push(`  ${i + 1}. [${r.score.toFixed(2)}] ${r.filePath}`);
    lines.push(`     ${r.title}`);

    const related = pspMap.get(r.noteId);
    if (related && related.problemSolutionPairs.length > 0) {
      const psp = related.problemSolutionPairs[0];
      lines.push(
        `     PSP: "${psp.problemPattern} → ${psp.solutionPattern}" (confidence: ${psp.confidence.toFixed(2)})`,
      );
    }

    lines.push("");
  }

  lines.push("No more results.");

  return lines.join("\n");
}

async function suggestAction(
  query: string | undefined,
  options: SuggestCommandOptions,
): Promise<void> {
  // 1. クエリ構築
  let effectiveQuery: string | undefined = query;

  if (!effectiveQuery && options.context) {
    effectiveQuery = options.context;
  }

  if (!effectiveQuery && options.file) {
    const filePath = resolve(options.file);
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${options.file}`);
      process.exitCode = 1;
      return;
    }
    const content = readFileSync(filePath, "utf-8");
    effectiveQuery = content.slice(0, 200);
  }

  if (!effectiveQuery) {
    console.error("Error: Provide a query, --context, or --file to specify the search context");
    process.exitCode = 1;
    return;
  }

  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");

  if (!existsSync(knowledgineDir)) {
    console.error('Not initialized. Run "knowledgine init --path <dir>" first.');
    process.exitCode = 1;
    return;
  }

  const format = options.format ?? "plain";
  if (!["json", "plain"].includes(format)) {
    console.error("Error: --format must be one of: json, plain");
    process.exitCode = 1;
    return;
  }

  const limit = options.limit ? parseInt(options.limit, 10) : 5;
  if (isNaN(limit) || limit < 1) {
    console.error("Error: --limit must be a positive integer");
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);

  try {
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const graphRepository = new GraphRepository(db);
    const service = new KnowledgeService({ repository, rootPath, graphRepository });

    // 検索実行（hybrid モード）
    const searchResult = await service.search({ query: effectiveQuery, mode: "hybrid", limit });

    // 上位結果に対して PSP を取得
    const pspMap = new Map<number, FindRelatedResult>();
    for (const r of searchResult.results) {
      const related = await service.findRelated({ noteId: r.noteId, limit: 3 });
      pspMap.set(r.noteId, related);
    }

    if (format === "json") {
      const pspList: FindRelatedResult[] = [];
      for (const related of pspMap.values()) {
        if (related.problemSolutionPairs.length > 0) {
          pspList.push(related);
        }
      }
      console.log(
        JSON.stringify(
          {
            query: effectiveQuery,
            mode: "hybrid",
            results: searchResult.results,
            psp: pspList,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(formatSuggestPlain(effectiveQuery, searchResult, pspMap));
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export function registerSuggestCommand(program: Command): void {
  program
    .command("suggest [query]")
    .description("Suggest related knowledge patterns for current context")
    .option("--context <text>", "Additional context description")
    .option("--file <path>", "Read context from file (first 200 chars)")
    .option("--format <format>", "Output format: json, plain", "plain")
    .option("--limit <n>", "Max results", "5")
    .option("--path <dir>", "Project root path")
    .action(suggestAction);
}
