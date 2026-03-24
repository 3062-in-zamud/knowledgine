import { Command } from "commander";
import { existsSync } from "fs";
import { resolve } from "path";
import { serve } from "@hono/node-server";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  ALL_MIGRATIONS,
  KnowledgeRepository,
  GraphRepository,
  KnowledgeService,
  VERSION,
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
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const graphRepository = new GraphRepository(db);
    const service = new KnowledgeService({ repository, rootPath, graphRepository });

    const app = createRestApp(service, VERSION);
    const port = parseInt(options.port ?? "3456", 10);
    const hostname = options.host ?? "127.0.0.1";

    const stats = service.getStats();

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
      },
    );

    // Graceful shutdown
    const shutdown = () => {
      console.error("\nShutting down...");
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
