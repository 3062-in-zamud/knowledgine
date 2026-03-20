import { resolve } from "path";
import { mkdirSync } from "fs";
import {
  defineConfig,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import { IngestEngine } from "@knowledgine/ingest";
import { createDefaultRegistry, initializePlugins } from "../lib/plugin-loader.js";
import { createProgress, formatDuration } from "../lib/progress.js";

export interface IngestOptions {
  source?: string;
  path?: string;
  full?: boolean;
  all?: boolean;
}

export async function ingestCommand(options: IngestOptions): Promise<void> {
  // Validate mutually exclusive options
  if (options.source && options.all) {
    console.error("Error: --source and --all cannot be used together");
    process.exitCode = 1;
    return;
  }

  if (!options.source && !options.all) {
    console.error("Error: Specify --source <pluginId> or --all");
    console.error("Usage: knowledgine ingest --source <id> --path <dir>");
    console.error("       knowledgine ingest --all --path <dir>");
    process.exitCode = 1;
    return;
  }

  const rootPath = resolve(options.path ?? process.cwd());

  // Initialize database (same pattern as init.ts)
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  mkdirSync(knowledgineDir, { recursive: true });
  const config = defineConfig({ rootPath });
  const db = createDatabase(config.dbPath, { enableVec: true });
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);

  // Setup plugin registry
  const registry = createDefaultRegistry();
  const initResults = await initializePlugins(registry);

  // Check for specific plugin
  if (options.source) {
    if (!registry.has(options.source)) {
      console.error(`Error: Plugin "${options.source}" is not registered.`);
      console.error(
        `Available plugins: ${registry.list().map((p) => p.manifest.id).join(", ")}`,
      );
      process.exitCode = 1;
      db.close();
      return;
    }

    const initResult = initResults.get(options.source);
    if (initResult && !initResult.ok) {
      console.error(
        `Error: Plugin "${options.source}" failed to initialize: ${initResult.error}`,
      );
      process.exitCode = 1;
      db.close();
      return;
    }
  }

  // Run ingest
  const engine = new IngestEngine(registry, db, repository);
  const startTime = Date.now();

  try {
    if (options.all) {
      const plugins = registry.list();
      const progress = createProgress(plugins.length, "Ingesting");
      let completed = 0;

      for (const plugin of plugins) {
        const initResult = initResults.get(plugin.manifest.id);
        if (initResult && !initResult.ok) {
          console.error(
            `Warning: Skipping "${plugin.manifest.id}" (init failed: ${initResult.error})`,
          );
          completed++;
          progress.update(completed, plugin.manifest.id);
          continue;
        }

        try {
          const summary = await engine.ingest(plugin.manifest.id, rootPath, {
            full: options.full,
          });
          completed++;
          progress.update(completed, plugin.manifest.id);
          console.error(
            `  ${plugin.manifest.id}: ${summary.processed} events (${summary.errors} errors, ${formatDuration(summary.elapsedMs)})`,
          );
        } catch (error) {
          completed++;
          progress.update(completed, plugin.manifest.id);
          console.error(
            `  ${plugin.manifest.id}: failed - ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      progress.finish();
    } else {
      const summary = await engine.ingest(options.source!, rootPath, {
        full: options.full,
      });
      console.error(
        `Ingest complete (${formatDuration(summary.elapsedMs)}): ${summary.processed} events, ${summary.errors} errors`,
      );
    }
  } catch (error) {
    console.error(
      `Ingest failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    const elapsed = formatDuration(Date.now() - startTime);
    console.error(`Total elapsed: ${elapsed}`);
    db.close();
  }
}
