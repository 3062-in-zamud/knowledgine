import { resolve, join } from "path";
import { mkdirSync, statSync } from "fs";
import { homedir } from "os";
import {
  defineConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  ALL_MIGRATIONS,
  loadRcFile,
  createLLMProvider,
  ObserverAgent,
  ReflectorAgent,
  PatternExtractor,
  EntityExtractor,
} from "@knowledgine/core";
import { IngestEngine } from "@knowledgine/ingest";
import { createDefaultRegistry, initializePlugins } from "../lib/plugin-loader.js";
import { createProgress, formatDuration, createSummaryReport } from "../lib/progress.js";
import { colors, symbols } from "../lib/ui/index.js";

export interface IngestOptions {
  source?: string;
  path?: string;
  full?: boolean;
  force?: boolean;
  all?: boolean;
  repo?: string;
  limit?: number;
  since?: string;
  unlimited?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  excludePattern?: string[];
  skipExtraction?: boolean;
  observe?: boolean;
  observeLimit?: number;
}

export async function ingestCommand(options: IngestOptions): Promise<void> {
  // --force is an alias for --full
  if (options.force) options.full = true;

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
  const graphRepository = new GraphRepository(db);

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
  const engine = new IngestEngine(registry, db, repository, graphRepository);
  const startTime = Date.now();
  const ingestedNoteIds: number[] = [];

  try {
    if (options.all) {
      const plugins = registry.list();
      const progress = createProgress(plugins.length, "Ingesting");
      let completed = 0;
      let totalProcessed = 0;
      let totalErrors = 0;
      let totalSkippedLargeDiff = 0;

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
            verbose: options.verbose,
            postProcessExtraction: !options.skipExtraction,
          });
          completed++;
          totalProcessed += summary.processed;
          totalErrors += summary.errors;
          totalSkippedLargeDiff += summary.skippedLargeDiff ?? 0;
          if (summary.noteIds) ingestedNoteIds.push(...summary.noteIds);
          progress.update(completed, plugin.manifest.id);

          const parts = [`${summary.processed} events`];
          if (summary.errors > 0) parts.push(`${summary.errors} errors`);
          if (summary.skippedLargeDiff && summary.skippedLargeDiff > 0) {
            parts.push(`${summary.skippedLargeDiff} large diffs skipped`);
          }
          if (summary.skipReason === "already_indexed") {
            parts.push("already indexed");
          }
          parts.push(formatDuration(summary.elapsedMs));

          if (summary.errors > 0 || (summary.skippedLargeDiff && summary.skippedLargeDiff > 0)) {
            console.error(
              `  ${symbols.warning} ${colors.warning(plugin.manifest.id)}: ${parts.join(", ")}`,
            );
          } else {
            console.error(
              `  ${symbols.success} ${colors.success(plugin.manifest.id)}: ${parts.join(", ")}`,
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
      const reportEntries = [
        { label: "Plugins:", value: `${plugins.length} run` },
        { label: "Events:", value: `${totalProcessed} processed` },
        { label: "Errors:", value: totalErrors },
        ...(totalSkippedLargeDiff > 0
          ? [
              {
                label: "Skipped:",
                value: `${totalSkippedLargeDiff} large diffs (metadata indexed only)`,
              },
            ]
          : []),
        { label: "Duration:", value: elapsed },
      ];
      const report = createSummaryReport("knowledgine ingest", reportEntries);
      console.error("\n" + report);
    } else {
      const pluginConfig: Record<string, unknown> = {};
      if (options.limit !== undefined) pluginConfig.limit = options.limit;
      if (options.since !== undefined) pluginConfig.since = options.since;
      if (options.unlimited) pluginConfig.unlimited = true;
      if (options.excludePattern && options.excludePattern.length > 0) {
        pluginConfig.noise = { excludePatterns: options.excludePattern };
      }

      const summary = await engine.ingest(options.source!, sourcePath, {
        full: options.full,
        pluginConfig: Object.keys(pluginConfig).length > 0 ? pluginConfig : undefined,
        verbose: options.verbose,
        excludePatterns:
          options.excludePattern && options.excludePattern.length > 0
            ? options.excludePattern
            : undefined,
        postProcessExtraction: !options.skipExtraction,
      });

      if (summary.noteIds) ingestedNoteIds.push(...summary.noteIds);

      const elapsed = formatDuration(Date.now() - startTime);
      const entries = [
        { label: "Source:", value: options.source! },
        { label: "Events:", value: `${summary.processed} processed` },
        { label: "Errors:", value: summary.errors },
        ...(summary.deleted > 0
          ? [{ label: "Removed:", value: `${summary.deleted} stale notes` }]
          : []),
        ...(summary.skippedLargeDiff && summary.skippedLargeDiff > 0
          ? [
              {
                label: "Skipped:",
                value: `${summary.skippedLargeDiff} large diffs (metadata indexed only)`,
              },
            ]
          : []),
        { label: "Duration:", value: elapsed },
      ];
      const report = createSummaryReport("knowledgine ingest", entries);
      console.error("\n" + report);

      // Show skip reason when 0 events processed
      if (summary.processed === 0 && summary.skipReason) {
        const reasons: Record<string, string> = {
          already_indexed: `All data already indexed (${summary.skipped} skipped). Use --force to re-ingest.`,
          no_source_data:
            "No source data found. Check that the path contains data for this plugin.",
          all_filtered: `All ${summary.skipped} events were filtered (empty content or noise). Use --verbose for details.`,
        };
        console.error(
          `\n${symbols.info} ${colors.hint(reasons[summary.skipReason] ?? "Unknown skip reason")}`,
        );
      }

      // Show default limit hint for git-history when no explicit limit was set
      if (
        options.source === "git-history" &&
        options.limit === undefined &&
        options.since === undefined &&
        !options.unlimited
      ) {
        console.error(
          `${symbols.info} ${colors.hint(
            `Default: latest 100 commits. Use --unlimited for all, --limit N for a custom limit, or --since YYYY-MM-DD for date-based filtering.`,
          )}`,
        );
      }
    }

    // Observer/Reflector post-processing
    const rcConfig = loadRcFile(rootPath);
    const shouldObserve = options.observe ?? rcConfig?.observer?.enabled ?? false;

    if (shouldObserve && ingestedNoteIds.length > 0) {
      const observeLimit = options.observeLimit ?? rcConfig?.observer?.limit ?? 50;
      const noteIdsToObserve = ingestedNoteIds.slice(0, observeLimit);

      let llmProvider: ReturnType<typeof createLLMProvider>;
      try {
        if (rcConfig?.llm) {
          llmProvider = createLLMProvider(rcConfig.llm);
        }
      } catch {
        // LLM not configured — rule-based mode
      }

      if (!llmProvider) {
        console.log("Observer running in rule-based mode (no LLM configured)");
      }

      const patternExtractor = new PatternExtractor();
      const entityExtractor = new EntityExtractor();
      const observer = new ObserverAgent({
        patternExtractor,
        entityExtractor,
        llmProvider,
        repository,
      });

      const notes = noteIdsToObserve
        .map((id) => repository.getNoteById(id))
        .filter((n): n is NonNullable<typeof n> => n !== null && n !== undefined);
      const observerOutputs = await observer.observeBatch(notes);

      const reflector = new ReflectorAgent({ repository, graphRepository, llmProvider });
      const reflectorOutputs = await reflector.reflectBatch(observerOutputs);

      const contradictions = reflectorOutputs.reduce((sum, r) => sum + r.contradictions.length, 0);
      const deprecations = reflectorOutputs.reduce(
        (sum, r) => sum + r.deprecationCandidates.length,
        0,
      );
      console.log(`Observer: processed ${observerOutputs.length} notes`);
      if (contradictions > 0 || deprecations > 0) {
        console.log(
          `Reflector: ${contradictions} contradictions, ${deprecations} deprecation candidates`,
        );
      }
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
