import { resolve } from "path";
import { existsSync, statSync, readFileSync } from "fs";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  loadSqliteVecExtension,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  ModelManager,
  DEFAULT_MODEL_NAME,
  checkSemanticReadiness,
} from "@knowledgine/core";
import type { SemanticReadiness, StorageBreakdown } from "@knowledgine/core";
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
  let notesBySubType: Record<string, number> = {};
  let readiness: SemanticReadiness | undefined;
  let breakdown: StorageBreakdown | undefined;
  try {
    const db = createDatabase(dbPath);
    if (config.embedding?.enabled) {
      await loadSqliteVecExtension(db);
    }
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    const stats = repository.getStats();
    totalNotes = stats.totalNotes;
    totalPatterns = stats.totalPatterns;
    notesBySubType = stats.notesBySubType;

    const modelManager = new ModelManager();
    readiness = checkSemanticReadiness(config, modelManager, repository);

    try {
      breakdown = repository.getStorageBreakdown();
    } catch {
      // Breakdown is best-effort; main status output should not fail.
      breakdown = undefined;
    }

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
  const modelName = config.embedding?.modelName ?? DEFAULT_MODEL_NAME;
  const modelLine = modelAvailable
    ? `${symbols.success} ${modelName} (available)`
    : `${symbols.warning} ${modelName} (not found)`;

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
      `${symbols.arrow} ${colors.hint(`Embedding coverage is ${embeddingCoverage}%. Run 'knowledgine ingest --embed-missing' to improve coverage.`)}`,
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

  // Build sub-type breakdown lines (more granular than source)
  const SUB_TYPE_LABELS: Record<string, string> = {
    commit: "commits",
    pull_request: "pull requests",
    pr_comment: "PR comments",
    pr_review: "PR reviews",
    issue: "issues",
    issue_comment: "issue comments",
    github_other: "github other",
    file: "files",
    claude_session: "claude sessions",
    cursor_session: "cursor sessions",
    obsidian: "obsidian notes",
  };
  const subTypeEntries = Object.entries(notesBySubType).sort(([, a], [, b]) => b - a);
  const subTypeLines = subTypeEntries.map(([type, count]) => {
    const label = SUB_TYPE_LABELS[type] ?? type;
    return `    ${colors.dim(label.padEnd(16))}${count}`;
  });

  // Per-category storage breakdown lines (skipped when dbstat is unavailable).
  const breakdownLines: string[] = [];
  if (breakdown && breakdown.fallback !== "page-count-only") {
    const categoryOrder: Array<keyof StorageBreakdown["byCategory"]> = [
      "notes",
      "fts",
      "embeddings",
      "graph",
      "events",
      "memory",
      "other",
    ];
    breakdownLines.push(`  ${pad("Breakdown:")}`);
    for (const cat of categoryOrder) {
      breakdownLines.push(
        `    ${colors.dim(cat.padEnd(16))}${formatBytes(breakdown.byCategory[cat])}`,
      );
    }
    if (breakdown.freelistBytes > 0) {
      breakdownLines.push(
        `    ${colors.dim("freelist".padEnd(16))}${formatBytes(breakdown.freelistBytes)}`,
      );
    }
    if (breakdown.walBytes > 0) {
      breakdownLines.push(`    ${colors.dim("wal".padEnd(16))}${formatBytes(breakdown.walBytes)}`);
    }
  } else if (breakdown && breakdown.fallback === "page-count-only") {
    breakdownLines.push(
      `  ${pad("Breakdown:")}${colors.hint("unavailable (dbstat not compiled)")}`,
    );
  }

  const contentParts = [
    `${colors.bold("Database")}`,
    `  ${pad("Path:")}${dbPath} (${sizeStr})`,
    `  ${pad("Notes:")}${colors.info(String(totalNotes))} indexed`,
    ...(subTypeEntries.length > 1 ? subTypeLines : []),
    `  ${pad("Patterns:")}${colors.info(String(totalPatterns))} extracted`,
    `  ${pad("Embeddings:")}${colors.info(`${embeddingsGenerated}/${totalNotes} (${embeddingCoverage}%)`)} generated`,
    ...breakdownLines,
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
