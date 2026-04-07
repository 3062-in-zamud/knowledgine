import { resolve } from "path";
import { existsSync } from "fs";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  ALL_MIGRATIONS,
  KnowledgeService,
} from "@knowledgine/core";
import type { Command } from "commander";
import {
  formatSearchResults,
  formatRelatedNotes,
  formatStats,
  formatEntities,
} from "../lib/formatter.js";
import type { OutputFormat } from "../lib/formatter.js";

const CLI_ERRORS = {
  NOT_INITIALIZED: 'Not initialized. Run "knowledgine init --path <dir>" first.',
  GRAPH_NOT_AVAILABLE: "Knowledge graph is not available. Run init with graph support.",
  FEEDBACK_NOT_AVAILABLE: "Feedback system is not available.",
  NOTE_ID_OR_FILE_REQUIRED: "Either --id <noteId> or --file <path> is required.",
  ENTITY_ID_OR_NAME_REQUIRED: "Either entityId or entityName is required.",
  INVALID_PATH: "Invalid file path: outside of root directory.",
} as const;

function validateLimit(value: string | undefined): number {
  if (value === undefined) return 20;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1 || n > 10000)
    throw new Error("--limit must be a positive integer (1-10000)");
  return n;
}

function validateMode(value: string | undefined): "keyword" | "semantic" | "hybrid" {
  if (value === undefined) return "keyword";
  if (!["keyword", "semantic", "hybrid"].includes(value))
    throw new Error("--mode must be one of: keyword, semantic, hybrid");
  return value as "keyword" | "semantic" | "hybrid";
}

function validateFormat(value: string | undefined): OutputFormat {
  if (value === undefined) return "table";
  if (!["json", "table", "plain"].includes(value))
    throw new Error("--format must be one of: json, table, plain");
  return value as OutputFormat;
}

export interface ToolSearchOptions {
  path?: string;
  limit?: string;
  mode?: string;
  format?: string;
}

export async function toolSearchCommand(query: string, options: ToolSearchOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(CLI_ERRORS.NOT_INITIALIZED);
    process.exitCode = 1;
    return;
  }

  let limit: number;
  let mode: "keyword" | "semantic" | "hybrid";
  let format: OutputFormat;
  try {
    limit = validateLimit(options.limit);
    mode = validateMode(options.mode);
    format = validateFormat(options.format);
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
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
    const result = await service.search({ query, limit, mode });
    if (result.results.length === 0) {
      console.error(`No results for "${query}"`);
    } else {
      console.error(formatSearchResults(result.results, format));
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export interface ToolRelatedOptions {
  path?: string;
  id?: string;
  file?: string;
  limit?: string;
  format?: string;
}

export async function toolRelatedCommand(options: ToolRelatedOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(CLI_ERRORS.NOT_INITIALIZED);
    process.exitCode = 1;
    return;
  }

  if (!options.id && !options.file) {
    console.error(`Error: ${CLI_ERRORS.NOTE_ID_OR_FILE_REQUIRED}`);
    process.exitCode = 1;
    return;
  }

  let limit: number;
  let format: OutputFormat;
  try {
    limit = validateLimit(options.limit);
    format = validateFormat(options.format);
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    return;
  }

  const noteId = options.id ? parseInt(options.id, 10) : undefined;
  if (options.id && (isNaN(noteId!) || noteId! < 1)) {
    console.error("Error: --id must be a positive integer");
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
    const result = await service.findRelated({
      noteId,
      filePath: options.file,
      limit,
    });
    console.error(formatRelatedNotes(result, format));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Invalid file path")) {
      console.error(`Error: ${CLI_ERRORS.INVALID_PATH}`);
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export interface ToolStatsOptions {
  path?: string;
  format?: string;
}

export async function toolStatsCommand(options: ToolStatsOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(CLI_ERRORS.NOT_INITIALIZED);
    process.exitCode = 1;
    return;
  }

  let format: OutputFormat;
  try {
    format = validateFormat(options.format);
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
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
    const result = service.getStats();
    console.error(formatStats(result, format));
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export interface ToolEntitiesOptions {
  path?: string;
  limit?: string;
  format?: string;
}

export async function toolEntitiesCommand(
  query: string,
  options: ToolEntitiesOptions,
): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(CLI_ERRORS.NOT_INITIALIZED);
    process.exitCode = 1;
    return;
  }

  let limit: number;
  let format: OutputFormat;
  try {
    limit = validateLimit(options.limit);
    format = validateFormat(options.format);
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
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
    const result = service.searchEntities({ query, limit });
    if (result.totalResults === 0) {
      console.error(`No entities found for "${query}"`);
    } else {
      console.error(formatEntities(result, format));
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export function registerToolCommands(program: Command): void {
  const toolCmd = program.command("tool").description("Knowledge base query tools");

  toolCmd
    .command("search [query]")
    .description("Search indexed notes")
    .option("--query <q>", "Search query (use for queries starting with -)")
    .option("--path <dir>", "Root directory")
    .option("--limit <n>", "Maximum results (1-10000)", "20")
    .option("--mode <mode>", "Search mode: keyword, semantic, hybrid", "keyword")
    .option("--format <format>", "Output format: json, table, plain", "table")
    .action(
      (
        positionalQuery: string | undefined,
        opts: {
          query?: string;
          path?: string;
          limit?: string;
          mode?: string;
          format?: string;
        },
      ) => {
        const query = opts.query ?? positionalQuery;
        if (!query || !query.trim()) {
          console.error("Error: Search query is required.");
          console.error('Usage: knowledgine tool search "your query"');
          console.error('       knowledgine tool search --query "your query"');
          process.exitCode = 1;
          return;
        }
        return toolSearchCommand(query, opts);
      },
    );

  toolCmd
    .command("related")
    .description("Find related notes for a given note")
    .option("--path <dir>", "Root directory")
    .option("--id <noteId>", "Note ID")
    .option("--file <path>", "File path")
    .option("--limit <n>", "Maximum results (1-10000)", "5")
    .option("--format <format>", "Output format: json, table, plain", "table")
    .action(toolRelatedCommand);

  toolCmd
    .command("stats")
    .description("Show knowledge base statistics")
    .option("--path <dir>", "Root directory")
    .option("--format <format>", "Output format: json, table, plain", "table")
    .action(toolStatsCommand);

  toolCmd
    .command("entities <query>")
    .description("Search entities in the knowledge graph")
    .option("--path <dir>", "Root directory")
    .option("--limit <n>", "Maximum results (1-10000)", "20")
    .option("--format <format>", "Output format: json, table, plain", "table")
    .action(toolEntitiesCommand);
}
