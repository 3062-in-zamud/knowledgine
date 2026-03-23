import { resolve, join } from "path";
import { mkdirSync, statSync } from "fs";
import { homedir } from "os";
import {
  defineConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import { IngestEngine } from "@knowledgine/ingest";
import { createDefaultRegistry, initializePlugins } from "../lib/plugin-loader.js";
import { createProgress, formatDuration, createSummaryReport } from "../lib/progress.js";
import { colors, symbols } from "../lib/ui/index.js";

export interface IngestOptions {
  source?: string;
  path?: string;
  full?: boolean;
  all?: boolean;
  repo?: string;
}

export async function ingestCommand(options: IngestOptions): Promise<void> {
  // Validate mutually exclusive options
  if (options.source && options.all) {
    console.error(colors.error("Error: --source and --all cannot be used together"));
    process.exitCode = 1;
    return;
  }

  if (!options.source && !options.all) {
    console.error(colors.error("Error: Specify --source <pluginId> or --all"));
    console.error("Usage: knowledgine ingest --source <id> --path <dir>");
    console.error("       knowledgine ingest --all --path <dir>");
    process.exitCode = 1;
    return;
  }

  const rootPath = resolveDefaultPath(options.path);

  // Initialize database (same pattern as init.ts)
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  mkdirSync(knowledgineDir, { recursive: true });
  const config = defineConfig({ rootPath });
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);

  // Setup plugin registry
  const registry = createDefaultRegistry();
  const initResults = await initializePlugins(registry);

  // Check for specific plugin
  if (options.source) {
    if (!registry.has(options.source)) {
      console.error(colors.error(`Error: Plugin "${options.source}" is not registered.`));
      console.error(
        `Available plugins: ${registry
          .list()
          .map((p) => p.manifest.id)
          .join(", ")}`,
      );
      process.exitCode = 1;
      db.close();
      return;
    }

    const initResult = initResults.get(options.source);
    if (initResult && !initResult.ok) {
      console.error(
        colors.error(`Error: Plugin "${options.source}" failed to initialize: ${initResult.error}`),
      );
      process.exitCode = 1;
      db.close();
      return;
    }
  }

  // Determine sourcePath based on plugin type
  let sourcePath = rootPath;
  if (options.source === "github") {
    if (!options.repo) {
      console.error(colors.error("Error: --repo <owner/repo> is required for --source github"));
      console.error("Usage: knowledgine ingest --source github --repo owner/repo --path <dir>");
      process.exitCode = 1;
      db.close();
      return;
    }
    sourcePath = `github://${options.repo}`;
  } else if (options.source === "claude-sessions") {
    // Map the project root path to the Claude projects directory name
    // e.g. /Users/foo/workspaces/bar → -Users-foo-workspaces-bar
    const projectDirName = rootPath.replace(/\//g, "-");
    const projectSessionDir = join(homedir(), ".claude", "projects", projectDirName);

    // Use project-specific directory if it exists, otherwise scan all
    try {
      const dirStat = statSync(projectSessionDir);
      if (dirStat.isDirectory()) {
        sourcePath = projectSessionDir;
      } else {
        sourcePath = join(homedir(), ".claude", "projects");
      }
    } catch {
      // Project-specific dir doesn't exist — fall back to all projects
      sourcePath = join(homedir(), ".claude", "projects");
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
      let totalProcessed = 0;
      let totalErrors = 0;

      for (const plugin of plugins) {
        const initResult = initResults.get(plugin.manifest.id);
        if (initResult && !initResult.ok) {
          console.error(
            `  ${symbols.info} ${colors.hint(plugin.manifest.id)} skipped (init failed: ${initResult.error})`,
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
          totalProcessed += summary.processed;
          totalErrors += summary.errors;
          progress.update(completed, plugin.manifest.id);
          if (summary.errors > 0) {
            console.error(
              `  ${symbols.warning} ${colors.warning(plugin.manifest.id)}: ${summary.processed} events (${summary.errors} errors, ${formatDuration(summary.elapsedMs)})`,
            );
          } else {
            console.error(
              `  ${symbols.success} ${colors.success(plugin.manifest.id)}: ${summary.processed} events (${formatDuration(summary.elapsedMs)})`,
            );
          }
        } catch (error) {
          completed++;
          totalErrors++;
          progress.update(completed, plugin.manifest.id);
          console.error(
            `  ${symbols.warning} ${colors.warning(plugin.manifest.id)}: failed - ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      progress.finish();
      const elapsed = formatDuration(Date.now() - startTime);
      const report = createSummaryReport("knowledgine ingest", [
        { label: "Plugins:", value: `${plugins.length} run` },
        { label: "Events:", value: `${totalProcessed} processed` },
        { label: "Errors:", value: totalErrors },
        { label: "Duration:", value: elapsed },
      ]);
      console.error("\n" + report);
    } else {
      const summary = await engine.ingest(options.source!, sourcePath, {
        full: options.full,
      });
      const elapsed = formatDuration(Date.now() - startTime);
      const entries = [
        { label: "Source:", value: options.source! },
        { label: "Events:", value: `${summary.processed} processed` },
        { label: "Errors:", value: summary.errors },
        ...(summary.deleted > 0
          ? [{ label: "Removed:", value: `${summary.deleted} stale notes` }]
          : []),
        { label: "Duration:", value: elapsed },
      ];
      const report = createSummaryReport("knowledgine ingest", entries);
      console.error("\n" + report);
    }
  } catch (error) {
    console.error(
      colors.error(`Ingest failed: ${error instanceof Error ? error.message : String(error)}`),
    );
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
