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
import type { FindRelatedResult, SearchKnowledgeResult, KnowledgeNote } from "@knowledgine/core";
import type { Command } from "commander";
import { parseDiff } from "../lib/diff-parser.js";
import { extractSmartContent } from "../lib/content-extractor.js";

export interface SuggestCommandOptions {
  context?: string;
  file?: string;
  format?: string;
  limit?: string;
  path?: string;
  diff?: string | boolean;
}

interface DiffSuggestResult {
  filePath: string;
  codeLocationMatches: KnowledgeNote[];
  searchResults: SearchKnowledgeResult;
  pspMap: Map<number, FindRelatedResult>;
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

    lines.push(`     [note: ${r.noteId}]`);
    lines.push("");
  }

  lines.push("No more results.");

  return lines.join("\n");
}

function formatDiffSuggestPlain(results: DiffSuggestResult[]): string {
  if (results.length === 0) {
    return "No past review patterns found.";
  }

  const lines: string[] = [];

  for (const fileResult of results) {
    const totalFound =
      fileResult.codeLocationMatches.length + fileResult.searchResults.results.length;
    if (totalFound === 0) continue;

    lines.push(`📁 ${fileResult.filePath} (${totalFound} past reviews found)`);

    let idx = 1;

    // コードロケーション一致
    for (const note of fileResult.codeLocationMatches) {
      const title = note.title ?? "(no title)";
      const loc = note.code_location_json
        ? (() => {
            try {
              const parsed = JSON.parse(note.code_location_json) as { line?: number };
              return parsed.line !== undefined ? ` (line ${parsed.line})` : "";
            } catch {
              return "";
            }
          })()
        : "";
      lines.push(`  ${idx}. [code-location] ${title}${loc}`);
      idx++;
    }

    // PSP 検索結果
    for (const r of fileResult.searchResults.results) {
      lines.push(`  ${idx}. [${r.score.toFixed(2)}] Review comment: "${r.title}"`);
      const related = fileResult.pspMap.get(r.noteId);
      if (related && related.problemSolutionPairs.length > 0) {
        const psp = related.problemSolutionPairs[0];
        lines.push(
          `     PSP: "${psp.problemPattern} → ${psp.solutionPattern}" (confidence: ${psp.confidence.toFixed(2)})`,
        );
      }
      idx++;
    }

    lines.push("");
  }

  if (lines.length === 0) {
    return "No past review patterns found.";
  }

  return lines.join("\n").trimEnd();
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function suggestAction(
  query: string | undefined,
  options: SuggestCommandOptions,
): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");

  // --diff モード
  if (options.diff !== undefined) {
    if (!existsSync(knowledgineDir)) {
      console.error('Not initialized. Run "knowledgine init --path <dir>" first.');
      process.exitCode = 1;
      return;
    }

    let diffText: string;
    if (typeof options.diff === "string" && options.diff.length > 0) {
      const { execSync } = await import("child_process");
      diffText = execSync(`git diff ${options.diff}`, { encoding: "utf-8" });
    } else {
      diffText = await readStdin();
    }

    const diffFiles = parseDiff(diffText);

    if (diffFiles.length === 0) {
      console.log("No past review patterns found.");
      return;
    }

    const config = loadConfig(rootPath);
    const db = createDatabase(config.dbPath);

    try {
      new Migrator(db, ALL_MIGRATIONS).migrate();
      const repository = new KnowledgeRepository(db);
      const graphRepository = new GraphRepository(db);
      const service = new KnowledgeService({ repository, rootPath, graphRepository });

      const limit = options.limit ? parseInt(options.limit, 10) : 5;
      const diffResults: DiffSuggestResult[] = [];

      for (const diffFile of diffFiles) {
        // 1. コードロケーションで過去レビューを検索
        const codeLocationMatches = repository.searchByCodeLocation(diffFile.path);

        // 2. 追加コンテンツで PSP 検索
        const searchQuery = extractSmartContent(diffFile.addedContent, { maxLength: 2000 });
        let searchResults: SearchKnowledgeResult = {
          query: searchQuery,
          mode: "hybrid",
          actualMode: "hybrid",
          totalResults: 0,
          results: [],
        };
        const pspMap = new Map<number, FindRelatedResult>();

        if (searchQuery.trim()) {
          searchResults = await service.search({
            query: searchQuery,
            mode: "hybrid",
            limit,
          });

          for (const r of searchResults.results) {
            const related = await service.findRelated({ noteId: r.noteId, limit: 3 });
            pspMap.set(r.noteId, related);
          }
        }

        diffResults.push({
          filePath: diffFile.path,
          codeLocationMatches,
          searchResults,
          pspMap,
        });
      }

      const format = options.format ?? "plain";
      if (format === "json") {
        console.log(
          JSON.stringify(
            diffResults.map((r) => ({
              filePath: r.filePath,
              codeLocationMatches: r.codeLocationMatches,
              results: r.searchResults.results,
              psp: Array.from(r.pspMap.values()).filter((v) => v.problemSolutionPairs.length > 0),
            })),
            null,
            2,
          ),
        );
      } else {
        console.log(formatDiffSuggestPlain(diffResults));
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    } finally {
      db.close();
    }
    return;
  }

  // 通常モード: クエリ構築
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
    effectiveQuery = extractSmartContent(content, { maxLength: 2000 });
  }

  if (!effectiveQuery) {
    console.error("Error: Provide a query, --context, or --file to specify the search context");
    process.exitCode = 1;
    return;
  }

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
    .option("--file <path>", "Read context from file")
    .option(
      "--diff [ref]",
      "Check git diff against past review patterns (reads from stdin if no ref)",
    )
    .option("--format <format>", "Output format: json, plain", "plain")
    .option("--limit <n>", "Max results", "5")
    .option("--path <dir>", "Project root path")
    .action(suggestAction);
}
