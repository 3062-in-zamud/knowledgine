import { resolve } from "path";
import { existsSync } from "fs";
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

export interface RecallCommandOptions {
  related?: string;
  format?: string;
  path?: string;
  limit?: string;
  agentic?: boolean;
}

function toYaml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) {
    return "null";
  }
  if (typeof obj === "boolean" || typeof obj === "number") {
    return String(obj);
  }
  if (typeof obj === "string") {
    // エスケープが必要な文字を含む場合はクォート
    if (obj.includes("\n") || obj.includes(":") || obj.includes("#") || obj.startsWith(" ")) {
      return `"${obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj
      .map((item) => {
        const val = toYaml(item, indent + 1);
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          return `${pad}- \n${val}`;
        }
        return `${pad}- ${val}`;
      })
      .join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, val]) => {
        if (typeof val === "object" && val !== null && !Array.isArray(val)) {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
        }
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
        }
        return `${pad}${key}: ${toYaml(val, indent)}`;
      })
      .join("\n");
  }
  return String(obj);
}

function formatRecallSearchPlain(query: string, result: SearchKnowledgeResult): string {
  const lines: string[] = [];

  if (result.results.length === 0) {
    return `No results for "${query}".`;
  }

  lines.push(`Recall results for "${query}" (${result.totalResults} matches):`);
  lines.push("");

  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i];
    lines.push(`  ${i + 1}. [${r.score.toFixed(2)}] ${r.filePath}`);
    lines.push(`     ${r.title}`);
    if (r.matchReason.length > 0) {
      lines.push(
        `     Reason: ${r.matchReason.filter((m) => !m.startsWith("Warning:")).join(", ")}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatRecallRelatedPlain(result: FindRelatedResult): string {
  const lines: string[] = [];

  lines.push(`Recall for note ID: ${result.noteId}`);
  lines.push("");

  // 関連ノート
  if (result.relatedNotes.length > 0) {
    lines.push("Related Notes:");
    for (const n of result.relatedNotes) {
      lines.push(`  [${n.score.toFixed(2)}] ${n.filePath}  ${n.title}`);
      if (n.reasons.length > 0) {
        lines.push(`    Reason: ${n.reasons.join(", ")}`);
      }
    }
    lines.push("");
  }

  // PSP（Problem-Solution Pairs）
  if (result.problemSolutionPairs.length > 0) {
    lines.push("Problem-Solution Pairs:");
    for (const p of result.problemSolutionPairs) {
      lines.push(`  [confidence: ${p.confidence.toFixed(2)}]`);
      lines.push(`    Problem: ${p.problemPattern}`);
      lines.push(`    Solution: ${p.solutionPattern}`);
    }
    lines.push("");
  }

  // グラフ関係
  if (result.graphRelations.length > 0) {
    lines.push("Knowledge Graph Relations:");
    for (const g of result.graphRelations) {
      lines.push(`  [${g.entityType}] ${g.name}`);
      for (const related of g.relatedEntities) {
        lines.push(
          `    -> [${related.entityType}] ${related.name} (${related.hops} hop${related.hops !== 1 ? "s" : ""})`,
        );
      }
    }
    lines.push("");
  }

  if (
    result.relatedNotes.length === 0 &&
    result.problemSolutionPairs.length === 0 &&
    result.graphRelations.length === 0
  ) {
    lines.push("No related knowledge found.");
  }

  return lines.join("\n");
}

async function recallAction(
  query: string | undefined,
  options: RecallCommandOptions,
): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");

  if (!existsSync(knowledgineDir)) {
    console.error('Not initialized. Run "knowledgine init --path <dir>" first.');
    process.exitCode = 1;
    return;
  }

  const format = options.format ?? "plain";
  if (!["json", "yaml", "plain"].includes(format)) {
    console.error("Error: --format must be one of: json, yaml, plain");
    process.exitCode = 1;
    return;
  }

  const limit = options.limit ? parseInt(options.limit, 10) : 10;
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

    // --related モード
    if (options.related !== undefined) {
      const noteId = parseInt(options.related, 10);
      if (isNaN(noteId) || noteId < 1) {
        console.error("Error: --related must be a positive integer (note ID)");
        process.exitCode = 1;
        return;
      }

      const result = await service.findRelated({ noteId, limit });

      if (format === "json") {
        console.log(JSON.stringify({ ok: true, command: "recall", result }, null, 2));
      } else if (format === "yaml") {
        console.log(toYaml({ ok: true, command: "recall", result }));
      } else {
        console.error(formatRecallRelatedPlain(result));
      }
      return;
    }

    // クエリ検索モード
    if (!query) {
      console.error("Error: query argument is required (or use --related <noteId>)");
      process.exitCode = 1;
      return;
    }

    const result = await service.search({
      query,
      limit,
      mode: "keyword",
      agentic: options.agentic,
    });

    if (format === "json") {
      console.log(JSON.stringify({ ok: true, command: "recall", result }, null, 2));
    } else if (format === "yaml") {
      console.log(toYaml({ ok: true, command: "recall", result }));
    } else {
      console.error(formatRecallSearchPlain(query, result));
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export function registerRecallCommand(program: Command): void {
  program
    .command("recall [query]")
    .description("Recall knowledge from the knowledge base")
    .option("--related <noteId>", "Find related knowledge by note ID")
    .option("--format <format>", "Output format: json, yaml, plain", "plain")
    .option("--path <dir>", "Project root path")
    .option("--limit <n>", "Max results", "10")
    .option("--agentic", "Include deprecated notes (agentic mode)")
    .action(recallAction);
}
