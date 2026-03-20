import { resolve, join } from "path";
import { existsSync, statSync, readFileSync } from "fs";
import { homedir } from "os";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  ModelManager,
} from "@knowledgine/core";

export interface StatusOptions {
  path?: string;
}

interface McpTargetStatus {
  name: string;
  configured: boolean;
  configPath: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getClaudeDesktopConfigPath(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "linux":
      return join(homedir(), ".config", "claude", "claude_desktop_config.json");
    case "win32":
      return join(process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
    default:
      return join(homedir(), ".config", "claude", "claude_desktop_config.json");
  }
}

function getCursorConfigPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

function checkMcpConfig(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    return config.mcpServers != null && "knowledgine" in config.mcpServers;
  } catch {
    return false;
  }
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const rootPath = resolve(options.path ?? process.cwd());
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  const dbPath = resolve(knowledgineDir, "index.sqlite");

  console.error("");

  // Database check
  if (!existsSync(knowledgineDir) || !existsSync(dbPath)) {
    console.error("  Status: Not initialized");
    console.error(`  Run 'knowledgine init --path ${rootPath}' to get started.`);
    console.error("");
    return;
  }

  const dbStat = statSync(dbPath);
  console.error(`  Database:    ${dbPath} (${formatBytes(dbStat.size)})`);

  // Open DB and get stats
  let totalNotes = 0;
  let totalPatterns = 0;
  let notesWithoutEmbeddings = 0;
  try {
    const db = createDatabase(dbPath, { enableVec: true });
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    const stats = repository.getStats();
    totalNotes = stats.totalNotes;
    totalPatterns = stats.totalPatterns;
    notesWithoutEmbeddings = repository.getNotesWithoutEmbeddings().length;

    db.close();
  } catch (error) {
    console.error(`  Error reading database: ${error instanceof Error ? error.message : String(error)}`);
    console.error("");
    return;
  }

  const embeddingsGenerated = totalNotes - notesWithoutEmbeddings;
  console.error(`    Notes:     ${totalNotes} indexed`);
  console.error(`    Patterns:  ${totalPatterns} extracted`);
  console.error(`    Embeddings: ${embeddingsGenerated}/${totalNotes} generated`);

  // Model check
  const modelManager = new ModelManager();
  const modelAvailable = modelManager.isModelAvailable();
  console.error(`  Model:       all-MiniLM-L6-v2 (${modelAvailable ? "available" : "not found"})`);

  // MCP config checks
  const targets: McpTargetStatus[] = [
    {
      name: "Claude Desktop",
      configured: checkMcpConfig(getClaudeDesktopConfigPath()),
      configPath: getClaudeDesktopConfigPath(),
    },
    {
      name: "Cursor",
      configured: checkMcpConfig(getCursorConfigPath()),
      configPath: getCursorConfigPath(),
    },
  ];

  console.error("  MCP Config:");
  for (const t of targets) {
    const status = t.configured ? "configured" : "not configured";
    console.error(`    ${t.name}: ${status}`);
  }

  // Overall status
  const isReady = totalNotes > 0 && modelAvailable && embeddingsGenerated > 0;
  const isPartial = totalNotes > 0 && (!modelAvailable || embeddingsGenerated === 0);
  const statusLabel = isReady ? "Ready" : isPartial ? "Partial (text search available)" : "Not initialized";
  console.error(`  Status:      ${statusLabel}`);

  if (!modelAvailable) {
    console.error("");
    console.error("  Hint: Run 'knowledgine init' to download the model and generate embeddings.");
  }

  const unconfigured = targets.filter((t) => !t.configured);
  if (unconfigured.length > 0 && totalNotes > 0) {
    console.error("");
    console.error("  Hint: Run 'knowledgine setup' to configure your AI tool.");
  }

  console.error("");
}
