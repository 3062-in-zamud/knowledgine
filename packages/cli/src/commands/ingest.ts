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
  ModelManager,
  DEFAULT_MODEL_NAME,
  loadSqliteVecExtension,
  OnnxEmbeddingProvider,
  buildEmbeddingInput,
} from "@knowledgine/core";
import { IngestEngine } from "@knowledgine/ingest";
import { createDefaultRegistry, initializePlugins } from "../lib/plugin-loader.js";
import { createProgress, formatDuration, createSummaryReport } from "../lib/progress.js";
import { colors, symbols } from "../lib/ui/index.js";

/** Generic entity names to exclude from "top entities" suggestions. */
const GENERIC_ENTITIES = new Set([
  "readme",
  "package.json",
  "src",
  "test",
  "tests",
  "index",
  "main",
  "lib",
  "dist",
  "docs",
  "config",
  "node_modules",
  "changelog",
  "license",
  "todo",
  "app",
  "utils",
  "build",
  ".github",
  "public",
  "assets",
  "vendor",
]);

interface TopEntity {
  name: string;
  count: number;
}

function getTopEntities(repository: KnowledgeRepository, limit: number): TopEntity[] {
  try {
    const rows = repository.getTopEntities(limit + GENERIC_ENTITIES.size);
    return rows.filter((r) => !GENERIC_ENTITIES.has(r.name.toLowerCase())).slice(0, limit);
  } catch {
    return [];
  }
}

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
  noEmbeddings?: boolean;
  embedMissing?: boolean;
}

export async function ingestCommand(options: IngestOptions): Promise<void> {
  // --force is an alias for --full
  if (options.force) options.full = true;

  // --embed-missing: generate embeddings for notes that are missing them (no normal ingest)
  if (options.embedMissing) {
    await embedMissingCommand(options);
    return;
  }

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

      // Next-step hint after --all ingest
      const uniqueAllNoteIds = Array.from(new Set(ingestedNoteIds));
      if (uniqueAllNoteIds.length > 0) {
        console.error(`  → Try: knowledgine search '<your query>' --mode hybrid`);
      }
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

      // Show error details when errors occurred
      if (summary.errors > 0 && summary.errorDetails && summary.errorDetails.length > 0) {
        const displayCount = options.verbose
          ? summary.errorDetails.length
          : Math.min(5, summary.errorDetails.length);
        console.error(
          `\n  ${symbols.warning} ${colors.warning(`${summary.errors} error(s) during ingest:`)}`,
        );
        for (let i = 0; i < displayCount; i++) {
          const e = summary.errorDetails[i];
          console.error(`    [${e.category}] ${e.sourceUri} — ${e.message}`);
        }
        if (!options.verbose && summary.errorDetails.length > 5) {
          console.error(
            `    ... and ${summary.errorDetails.length - 5} more (use --verbose to see all)`,
          );
        }
        if (options.verbose) {
          // category breakdown
          const counts: Record<string, number> = {};
          for (const e of summary.errorDetails) {
            counts[e.category] = (counts[e.category] ?? 0) + 1;
          }
          const breakdown = Object.entries(counts)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          console.error(`    Categories: ${breakdown}`);
        }
      }

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

      // Next-step hint after single-source ingest
      const uniqueSingleNoteIds = Array.from(new Set(ingestedNoteIds));
      if (uniqueSingleNoteIds.length > 0) {
        console.error(`  → Try: knowledgine search '<your query>' --mode hybrid`);
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

    // Intelligent post-ingest summary
    const uniqueIngestedNoteIds = Array.from(new Set(ingestedNoteIds));
    if (uniqueIngestedNoteIds.length > 0) {
      try {
        const topEntities = getTopEntities(repository, 5);
        if (topEntities.length > 0) {
          console.error("");
          console.error("  Top entities discovered:");
          for (const { name, count } of topEntities) {
            console.error(`    • ${name} (${count} notes)`);
          }
          // Suggest search with top entity
          const topEntity = topEntities[0];
          console.error("");
          console.error(`  → Try: knowledgine search '${topEntity.name}' --mode hybrid`);
        }
      } catch {
        // Non-fatal: summary generation failure should not break ingest
      }
    }

    // Observer/Reflector post-processing
    const rcConfig = loadRcFile(rootPath);
    const shouldObserve = options.observe ?? rcConfig?.observer?.enabled ?? false;

    if (shouldObserve && uniqueIngestedNoteIds.length > 0) {
      const observeLimit = options.observeLimit ?? rcConfig?.observer?.limit ?? 50;
      const noteIdsToObserve = uniqueIngestedNoteIds.slice(0, observeLimit);

      let llmProvider: ReturnType<typeof createLLMProvider> | undefined = undefined;
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

    // === Embedding generation for newly ingested notes ===
    // uniqueIngestedNoteIds is already declared above for the Observer block
    if (options.noEmbeddings) {
      if (uniqueIngestedNoteIds.length > 0) {
        console.error(
          `  ${symbols.warning} ${colors.warning("Embedding generation skipped (--no-embeddings). Semantic search will not work for these notes.")}`,
        );
      }
    } else if (uniqueIngestedNoteIds.length > 0) {
      const embeddingConfig = rcConfig?.embedding as
        | { enabled?: boolean; modelName?: string }
        | undefined;
      const embeddingEnabled = embeddingConfig?.enabled ?? rcConfig?.semantic ?? false;

      if (embeddingEnabled) {
        const modelManager = new ModelManager();
        const modelName = embeddingConfig?.modelName ?? DEFAULT_MODEL_NAME;

        if (modelManager.isModelAvailable(modelName)) {
          try {
            const vecLoaded = await loadSqliteVecExtension(db);
            if (vecLoaded) {
              // Find notes that need embeddings before initializing the provider
              const noteIdsNeedingEmbeddings = repository.getNotesWithoutEmbeddingIds();

              if (noteIdsNeedingEmbeddings.length > 0) {
                const embeddingProvider = new OnnxEmbeddingProvider(modelName, modelManager);
                const BATCH_SIZE = 20;
                const total = noteIdsNeedingEmbeddings.length;
                console.error(`\n  ${symbols.info} Generating embeddings for ${total} notes...`);

                let interrupted = false;
                const onSigint = () => {
                  interrupted = true;
                };
                process.on("SIGINT", onSigint);

                try {
                  for (let i = 0; i < noteIdsNeedingEmbeddings.length; i += BATCH_SIZE) {
                    if (interrupted) break;

                    const batchIds = noteIdsNeedingEmbeddings.slice(i, i + BATCH_SIZE);
                    const noteRows = repository.getNotesByIds(batchIds);
                    const noteMap = new Map(noteRows.map((n) => [n.id, n]));
                    const orderedNotes = batchIds
                      .map((id) => noteMap.get(id))
                      .filter((n): n is NonNullable<typeof n> => n != null);
                    if (orderedNotes.length === 0) continue;

                    const embeddings = await embeddingProvider.embedBatch(
                      orderedNotes.map((n) => buildEmbeddingInput(n)),
                    );

                    repository.saveEmbeddingBatch(
                      orderedNotes.map((n, j) => ({
                        noteId: n.id,
                        embedding: embeddings[j],
                        modelName,
                      })),
                    );

                    // Progress
                    const done = Math.min(i + BATCH_SIZE, total);
                    const pct = Math.round((done / total) * 100);
                    process.stderr.write(
                      `\r  ${symbols.info} Embeddings: ${done}/${total} (${pct}%)`,
                    );
                  }
                } finally {
                  process.removeListener("SIGINT", onSigint);
                }

                if (!interrupted) {
                  console.error(
                    `\n  ${symbols.success} ${colors.success(`Embeddings generated for ${total} notes`)}`,
                  );
                } else {
                  console.error(
                    `\n  ${symbols.warning} ${colors.warning("Embedding generation interrupted.")}`,
                  );
                }

                await embeddingProvider.close();
              }
            }
          } catch (error) {
            // Non-fatal: embedding generation failure should not break ingest
            console.error(
              `  ${symbols.info} ${colors.hint(`Embedding generation skipped: ${error instanceof Error ? error.message : String(error)}`)}`,
            );
          }
        } else {
          console.error(
            `  ${symbols.info} ${colors.hint("Embedding model not available. Run 'knowledgine upgrade --semantic' to download.")}`,
          );
        }
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

/** Maximum number of retry attempts for a failed embedding batch. */
const MAX_EMBED_RETRIES = 2;

/**
 * Standalone flow for `knowledgine ingest --embed-missing`.
 * Generates embeddings only for notes that currently have none — no ingest is performed.
 */
async function embedMissingCommand(options: IngestOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);

  // Initialise DB (same pattern as the normal ingest flow)
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  mkdirSync(knowledgineDir, { recursive: true });
  const config = defineConfig({ rootPath });
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);

  try {
    const rcConfig = loadRcFile(rootPath);
    const embeddingConfig = rcConfig?.embedding as
      | { enabled?: boolean; modelName?: string }
      | undefined;
    const embeddingEnabled = embeddingConfig?.enabled ?? rcConfig?.semantic ?? false;

    if (!embeddingEnabled) {
      console.error(
        `  ${symbols.warning} ${colors.warning("Semantic search is not enabled. Run 'knowledgine upgrade --semantic' first.")}`,
      );
      process.exitCode = 1;
      return;
    }

    const modelManager = new ModelManager();
    const modelName = embeddingConfig?.modelName ?? DEFAULT_MODEL_NAME;

    if (!modelManager.isModelAvailable(modelName)) {
      console.error(
        `  ${symbols.warning} ${colors.warning("Embedding model not available. Run 'knowledgine upgrade --semantic' to download.")}`,
      );
      process.exitCode = 1;
      return;
    }

    const vecLoaded = await loadSqliteVecExtension(db);
    if (!vecLoaded) {
      console.error(
        `  ${symbols.warning} ${colors.warning("sqlite-vec extension could not be loaded. Embedding generation is unavailable.")}`,
      );
      process.exitCode = 1;
      return;
    }

    const totalNotes = repository.getStats().totalNotes;
    let repairedVectors = 0;
    const initialVectorStats = repository.getVectorIndexStats();
    if (initialVectorStats.missingVectorRows > 0) {
      repairedVectors = repository.syncMissingVectorsFromEmbeddings();
    }

    const noteIdsNeedingEmbeddings = repository.getNotesWithoutEmbeddingIds();

    if (noteIdsNeedingEmbeddings.length === 0) {
      const finalVectorStats = repository.getVectorIndexStats();
      const coverage =
        totalNotes > 0 ? Math.round((finalVectorStats.vectorRows / totalNotes) * 100) : 100;
      if (repairedVectors > 0) {
        console.error(
          `  ${symbols.success} ${colors.success(`Vector index repaired: ${repairedVectors} embeddings synced (coverage: ${coverage}%)`)}`,
        );
      } else {
        console.error(
          `  ${symbols.success} ${colors.success(`All notes have embeddings (coverage: ${coverage}%)`)}`,
        );
      }
      return;
    }

    const embeddingProvider = new OnnxEmbeddingProvider(modelName, modelManager);
    const BATCH_SIZE = 20;
    const total = noteIdsNeedingEmbeddings.length;
    console.error(`\n  ${symbols.info} Generating embeddings for ${total} notes...`);

    let generated = 0;
    let failed = 0;

    try {
      for (let i = 0; i < noteIdsNeedingEmbeddings.length; i += BATCH_SIZE) {
        const batchIds = noteIdsNeedingEmbeddings.slice(i, i + BATCH_SIZE);
        const noteRows = repository.getNotesByIds(batchIds);
        const noteMap = new Map(noteRows.map((n) => [n.id, n]));
        const orderedNotes = batchIds
          .map((id) => noteMap.get(id))
          .filter((n): n is NonNullable<typeof n> => n != null);
        if (orderedNotes.length === 0) continue;

        for (let attempt = 0; attempt <= MAX_EMBED_RETRIES; attempt++) {
          try {
            const embeddings = await embeddingProvider.embedBatch(
              orderedNotes.map((n) => buildEmbeddingInput(n)),
            );
            const result = repository.saveEmbeddingBatch(
              orderedNotes.map((n, j) => ({
                noteId: n.id,
                embedding: embeddings[j],
                modelName,
              })),
            );
            generated += result.saved;
            failed += result.failed;
            break;
          } catch {
            if (attempt === MAX_EMBED_RETRIES) {
              failed += orderedNotes.length;
            } else {
              await new Promise<void>((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
            }
          }
        }

        const done = generated + failed;
        const pct = Math.round((done / total) * 100);
        process.stderr.write(`\r  ${symbols.info} Embeddings: ${done}/${total} (${pct}%)`);
      }
    } finally {
      await embeddingProvider.close();
    }

    process.stderr.write("\n");

    // Calculate final coverage
    const finalVectorStats = repository.getVectorIndexStats();
    const notesTotal = totalNotes > 0 ? totalNotes : total + generated;
    const coveragePct =
      notesTotal > 0 ? Math.round((finalVectorStats.vectorRows / notesTotal) * 100) : 100;

    if (failed > 0) {
      console.error(
        `  ${symbols.warning} ${colors.warning(`Embeddings: ${generated} generated, ${failed} failed (coverage: ${coveragePct}%)`)}`,
      );
    } else {
      console.error(
        `  ${symbols.success} ${colors.success(`Embeddings: ${generated} generated, 0 failed (coverage: ${coveragePct}%)`)}`,
      );
    }
  } catch (error) {
    console.error(
      colors.error(
        `Embed-missing failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
