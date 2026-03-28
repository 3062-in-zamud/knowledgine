import { Command } from "commander";
import { existsSync } from "fs";
import { resolve } from "path";
import { serve } from "@hono/node-server";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  loadSqliteVecExtension,
  Migrator,
  ALL_MIGRATIONS,
  KnowledgeRepository,
  GraphRepository,
  KnowledgeService,
  OnnxEmbeddingProvider,
  ModelManager,
  DEFAULT_MODEL_NAME,
  VERSION,
  checkSemanticReadiness,
} from "@knowledgine/core";
import { createRestApp } from "@knowledgine/mcp-server";

export interface ServeCommandOptions {
  port?: string;
  host?: string;
  path?: string;
}

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start REST API server for knowledge base access")
    .option("--port <n>", "Port number", "3456")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .option("--path <dir>", "Project root path")
    .action(serveAction);
}

async function serveAction(options: ServeCommandOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");

  if (!existsSync(knowledgineDir)) {
    console.error('Not initialized. Run "knowledgine init --path <dir>" first.');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);

  try {
    // Load sqlite-vec if semantic search is enabled
    if (config.embedding?.enabled) {
      await loadSqliteVecExtension(db);
    }

    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const graphRepository = new GraphRepository(db);

    // Initialize embedding provider based on actual semantic readiness
    const modelManager = new ModelManager();
    const semanticReadiness = checkSemanticReadiness(config, modelManager, repository);
    let embeddingProvider: OnnxEmbeddingProvider | undefined;
    if (semanticReadiness.ready) {
      embeddingProvider = new OnnxEmbeddingProvider(DEFAULT_MODEL_NAME, modelManager);
    }

    const service = new KnowledgeService({
      repository,
      rootPath,
      graphRepository,
      embeddingProvider,
    });

    const app = createRestApp(service, VERSION);
    const port = parseInt(options.port ?? "3456", 10);
    const hostname = options.host ?? "127.0.0.1";

    const stats = service.getStats();
    const searchMode = embeddingProvider ? "semantic + FTS5" : "FTS5 only";

    const server = serve(
      {
        fetch: app.fetch,
        port,
        hostname,
      },
      () => {
        console.error(`knowledgine REST API server running`);
        console.error(`  URL:    http://${hostname}:${port}`);
        console.error(`  Notes:  ${stats.totalNotes} indexed`);
        console.error(`  Search: ${searchMode}`);
      },
    );

    // Graceful shutdown
    const shutdown = async () => {
      console.error("\nShutting down...");
      if (embeddingProvider) {
        await embeddingProvider.close();
      }
      server.close();
      db.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    db.close();
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
