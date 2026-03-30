import { resolve } from "path";
import { existsSync, statSync, readFileSync } from "fs";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  ModelManager,
  checkSemanticReadiness,
} from "@knowledgine/core";
import type { SemanticReadiness } from "@knowledgine/core";
import { createBox, colors, symbols } from "../lib/ui/index.js";
import { getConfigPath, TARGETS, PROJECT_CONFIG_SUPPORT } from "./setup.js";
import * as TOML from "smol-toml";

export interface StatusOptions {
  path?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function checkMcpConfig(configPath: string, target: string): boolean {
  if (!existsSync(configPath)) return false;
  try {
    const raw = readFileSync(configPath, "utf-8");
    if (configPath.endsWith(".toml")) {
      const parsed = TOML.parse(raw) as Record<string, unknown>;
      const servers = parsed["mcp_servers"] as Record<string, unknown> | undefined;
      return servers != null && "knowledgine" in servers;
    }
    const config = JSON.parse(raw) as Record<string, unknown>;
    // Zed uses "context_servers", others use "mcpServers"
    const mcpKey = target === "zed" ? "context_servers" : "mcpServers";
    const servers = config[mcpKey] as Record<string, unknown> | undefined;
    return servers != null && "knowledgine" in servers;
  } catch {
    return false;
  }
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  const dbPath = resolve(knowledgineDir, "index.sqlite");

  console.error("");

  // Database check
  if (!existsSync(knowledgineDir) || !existsSync(dbPath)) {
    const notInitContent = [
      `${symbols.error} Status: Not initialized`,
      "",
      `${symbols.arrow} ${colors.hint(`Run 'knowledgine init --path ${rootPath}' to get started.`)}`,
    ].join("\n");
    console.error(createBox(notInitContent, { title: "knowledgine Status", type: "info" }));
    console.error("");
    return;
  }

  const dbStat = statSync(dbPath);
  const sizeStr = formatBytes(dbStat.size);

  const config = loadConfig(rootPath);

  // Open DB and get stats
  let totalNotes = 0;
  let totalPatterns = 0;
  let notesBySource: Record<string, number> = {};
  let readiness: SemanticReadiness | undefined;
  try {
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    const stats = repository.getStats();
    totalNotes = stats.totalNotes;
    totalPatterns = stats.totalPatterns;
    notesBySource = stats.notesBySource;

    const modelManager = new ModelManager();
    readiness = checkSemanticReadiness(config, modelManager, repository);

    db.close();
  } catch (error) {
    console.error(
      `  Error reading database: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error("");
    return;
  }

  // readiness is always set if we reach here (no early return from catch)
  const { modelAvailable, embeddingsCount: embeddingsGenerated, embeddingCoverage } = readiness!;
  const semanticMode = readiness!.ready;

  // MCP config checks — check all supported targets (global + project level)
  const configuredTools: string[] = [];
  for (const t of TARGETS) {
    try {
      // Check global config
      const globalPath = getConfigPath(t.value);
      if (checkMcpConfig(globalPath, t.value)) {
        configuredTools.push(t.label);
        continue;
      }
      // Check project-level config
      const projectFn = PROJECT_CONFIG_SUPPORT[t.value];
      if (projectFn) {
        const projectPath = projectFn(rootPath);
        if (checkMcpConfig(projectPath, t.value)) {
          configuredTools.push(t.label);
        }
      }
    } catch {
      // ignore unsupported targets
    }
  }

  // Overall status
  const isReady = totalNotes > 0;
  const statusLabel = readiness!.label;

  // Build content
  const modelLine = modelAvailable
    ? `${symbols.success} all-MiniLM-L6-v2 (available)`
    : `${symbols.warning} all-MiniLM-L6-v2 (not found)`;

  const statusLine = isReady
    ? `${symbols.success} ${colors.success(statusLabel)}`
    : `${symbols.error} ${colors.error(statusLabel)}`;

  const hints: string[] = [];
  if (!semanticMode && totalNotes > 0) {
    hints.push(
      `${symbols.arrow} ${colors.hint("Run 'knowledgine upgrade --semantic' to enable semantic search.")}`,
    );
  }
  if (semanticMode && embeddingCoverage < 80 && totalNotes > 0) {
    hints.push(
      `${symbols.arrow} ${colors.hint(`Embedding coverage is ${embeddingCoverage}%. Run 'knowledgine ingest --all' to improve coverage.`)}`,
    );
  }
  if (configuredTools.length === 0 && totalNotes > 0) {
    hints.push(
      `${symbols.arrow} ${colors.hint("Run 'knowledgine setup' to configure your AI tools.")}`,
    );
  }

  const pad = (label: string) => colors.dim(label.padEnd(14));

  const mcpLine =
    configuredTools.length > 0
      ? `${symbols.success} ${colors.success(configuredTools.join(", "))}`
      : colors.hint("none configured");

  // Build source breakdown lines
  const sourceEntries = Object.entries(notesBySource).sort(([, a], [, b]) => b - a);
  const sourceLines = sourceEntries.map(
    ([source, count]) => `    ${colors.dim(source.padEnd(16))}${count}`,
  );

  const contentParts = [
    `${colors.bold("Database")}`,
    `  ${pad("Path:")}${dbPath} (${sizeStr})`,
    `  ${pad("Notes:")}${colors.info(String(totalNotes))} indexed`,
    ...(sourceEntries.length > 1 ? sourceLines : []),
    `  ${pad("Patterns:")}${colors.info(String(totalPatterns))} extracted`,
    `  ${pad("Embeddings:")}${colors.info(`${embeddingsGenerated}/${totalNotes} (${embeddingCoverage}%)`)} generated`,
    "",
    `${colors.bold("Model:")}  ${modelLine}`,
    `${colors.bold("Search:")} ${semanticMode ? "semantic + FTS5" : "FTS5 only"}`,
    "",
    `${colors.bold("MCP:")}    ${mcpLine}`,
    "",
    statusLine,
  ];
  if (hints.length > 0) {
    contentParts.push("", ...hints);
  }

  console.error(
    createBox(contentParts.join("\n"), {
      title: "knowledgine Status",
      type: isReady ? "success" : "info",
    }),
  );
  console.error("");
}
