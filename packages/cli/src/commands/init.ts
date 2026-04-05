import { resolve, join } from "path";
import { mkdirSync, statSync, existsSync, readFileSync } from "fs";
import {
  loadConfig,
  writeRcConfig,
  resolveDefaultPath,
  createDatabase,
  loadSqliteVecExtension,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  IncrementalExtractor,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
  DEFAULT_MODEL_NAME,
  downloadModel,
  VERSION,
  buildEmbeddingInput,
} from "@knowledgine/core";
import { IngestEngine, PluginRegistry, MarkdownPlugin } from "@knowledgine/ingest";
import { createProgress, createStepProgress, formatDuration } from "../lib/progress.js";
import { copyDemoFixtures } from "../lib/demo-manager.js";
import { getDemoNotesPath } from "./demo.js";
import { colors, symbols } from "../lib/ui/index.js";
import * as p from "@clack/prompts";

export interface InitOptions {
  path?: string;
  semantic?: boolean;
  skipEmbeddings?: boolean;
  demo?: boolean;
  force?: boolean;
  yes?: boolean;
  saveConfig?: boolean;
  verbose?: boolean;
}

/**
 * Maximum number of retry attempts for network operations (e.g., model download).
 */
const MAX_DOWNLOAD_RETRIES = 3;

/**
 * Minimum disk space required for FTS5-only initialization.
 * SQLite index is roughly equal to the size of the source files.
 * We require 2x to account for index overhead.
 */
const DISK_MULTIPLIER_FTS5 = 2;

/**
 * Extra disk space required for the embedding model (~23 MB).
 */
const SEMANTIC_MODEL_BYTES = 23 * 1024 * 1024;

/**
 * Estimate the total size of markdown files under the given root path.
 * Returns 0 if the stat call fails (best-effort check).
 */
function estimateMarkdownSize(rootPath: string): number {
  try {
    const stat = statSync(rootPath);
    if (!stat.isDirectory()) return 0;
    // We cannot cheaply total all files without walking; use directory size as
    // a rough upper bound for the check. On most systems statSync on a directory
    // returns a small number (e.g. 128/4096), so we skip this approach and
    // rely on the caller to pass an explicit estimate when available.
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Check available disk space for the given path.
 * Returns Infinity when the check cannot be performed (non-critical guard).
 */
async function getFreeDiskBytes(targetPath: string): Promise<number> {
  try {
    // Use `df` to get available kilobytes, then convert to bytes.
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("df", ["-k", "--", targetPath]);
    // df output: Filesystem 1K-blocks Used Available Use% Mounted on
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) return Infinity;
    const parts = lines[1]!.trim().split(/\s+/);
    // "Available" is the 4th column (index 3)
    const availableKb = parseInt(parts[3] ?? "0", 10);
    if (isNaN(availableKb)) return Infinity;
    return availableKb * 1024;
  } catch {
    // df is not available (e.g. Windows) or failed — skip the check
    return Infinity;
  }
}

/**
 * Sleep for `ms` milliseconds (used for exponential backoff).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSkipReason(reason: string): string {
  const labels: Record<string, string> = {
    empty_content: "empty",
    too_large: "too large",
    excluded_pattern: "excluded",
    read_error: "read error",
  };
  return labels[reason] ?? reason;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const initStartTime = Date.now();
  let rootPath: string;

  p.intro(`${colors.bold("knowledgine")} ${colors.dim(`v${VERSION}`)}`);

  if (options.demo) {
    const demoPath = getDemoNotesPath(options.path);
    const count = copyDemoFixtures(demoPath);
    console.error(`${symbols.info} ${colors.info(`Copied ${count} demo notes to ${demoPath}`)}`);
    rootPath = demoPath;
  } else {
    rootPath = resolveDefaultPath(options.path);
  }

  // Deprecation warning for --skip-embeddings
  if (options.skipEmbeddings) {
    console.error(
      `${symbols.warning} ${colors.warning("--skip-embeddings is deprecated. Embeddings are now opt-in by default.")}`,
    );
    console.error(
      `  ${colors.warning("Use 'knowledgine init --semantic' to enable semantic search.")}`,
    );
    console.error("");
  }

  // Determine if semantic search should be enabled
  // --no-semantic explicitly disables; --semantic explicitly enables;
  // default: auto-enable if model is available (prompt for large repos)
  const semanticExplicitlyDisabled = options.semantic === false;
  let enableSemantic = options.semantic === true;

  // ---------------------------------------------------------------------------
  // Step 1: Create .knowledgine directory
  // ---------------------------------------------------------------------------
  const totalSteps = 5; // Always show 5 steps; skip semantic steps if not needed
  const stepProgress = createStepProgress(totalSteps, "Initializing knowledgine...");

  const knowledgineDir = resolve(rootPath, ".knowledgine");

  // Prompt for confirmation if the knowledge base already exists
  if (existsSync(knowledgineDir) && !options.force) {
    const shouldReinit = await p.confirm({
      message: "Knowledge base already exists. Reinitialize?",
    });
    if (!shouldReinit || p.isCancel(shouldReinit)) {
      p.cancel("Initialization cancelled.");
      process.exit(0);
    }
  }

  stepProgress.startStep("Creating .knowledgine directory");
  try {
    mkdirSync(knowledgineDir, { recursive: true });
    stepProgress.completeStep("Creating .knowledgine directory");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Check if this is a disk-related error
    if (
      message.includes("ENOSPC") ||
      message.includes("no space") ||
      message.includes("disk full")
    ) {
      const freeDisk = await getFreeDiskBytes(resolve(rootPath, ".."));
      const estimatedNeeded = estimateMarkdownSize(rootPath) * DISK_MULTIPLIER_FTS5;
      stepProgress.failStep("Creating .knowledgine directory", "Insufficient disk space");
      console.error("");
      console.error(colors.error("Error: Disk is full. Cannot create the knowledge base."));
      console.error("");
      console.error(`${symbols.warning} ${colors.warning("Disk space requirements:")}`);
      console.error(
        `  FTS5 text search only: source files x${DISK_MULTIPLIER_FTS5} (index overhead)`,
      );
      if (enableSemantic) {
        console.error(
          `  Semantic search (+--semantic): +${(SEMANTIC_MODEL_BYTES / (1024 * 1024)).toFixed(0)} MB (embedding model) + vector index`,
        );
      }
      if (estimatedNeeded > 0) {
        console.error(`  Estimated needed: ~${(estimatedNeeded / (1024 * 1024)).toFixed(1)} MB`);
      }
      if (freeDisk < Infinity) {
        console.error(`  Available:        ~${(freeDisk / (1024 * 1024)).toFixed(1)} MB`);
      }
      console.error("");
      console.error(`${symbols.warning} ${colors.warning("Free up disk space and re-run:")}`);
      console.error(
        `  knowledgine init${options.path ? ` --path ${options.path}` : ""}${enableSemantic ? " --semantic" : ""}`,
      );
      process.exit(1);
    }
    stepProgress.failStep("Creating .knowledgine directory", message);
    throw error;
  }

  // ---------------------------------------------------------------------------
  // Step 2: Initialize database
  // ---------------------------------------------------------------------------
  stepProgress.startStep("Initializing database");
  const config = loadConfig(rootPath);
  if (enableSemantic) {
    config.embedding.enabled = true;
  }
  const db = createDatabase(config.dbPath);

  if (enableSemantic) {
    try {
      await loadSqliteVecExtension(db);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stepProgress.failStep(
        "Initializing database",
        `sqlite-vec extension unavailable: ${message}`,
      );
      stepProgress.warn("Falling back to FTS5-only mode (no vector search)");
      // Continue without semantic — we degrade gracefully
      config.embedding.enabled = false;
    }
  }

  const { executed } = new Migrator(db, ALL_MIGRATIONS).migrate();
  if (executed > 0) {
    stepProgress.info(`Applied ${executed} database migration(s)`);
  }
  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);
  stepProgress.completeStep("Initializing database");

  // ---------------------------------------------------------------------------
  // Step 3: Index markdown files via IngestEngine
  // ---------------------------------------------------------------------------
  stepProgress.startStep("Indexing markdown files");

  const registry = new PluginRegistry();
  registry.register(new MarkdownPlugin());
  const mdPlugin = registry.get("markdown");
  if (mdPlugin) {
    await mdPlugin.initialize();
  }
  const engine = new IngestEngine(registry, db, repository);
  let ingestSummary;
  try {
    ingestSummary = await engine.ingest("markdown", rootPath, {
      full: true,
      verbose: options.verbose,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("heap") ||
      message.includes("out of memory") ||
      message.includes("allocation failed")
    ) {
      stepProgress.failStep("Indexing markdown files", "Out of memory");
      console.error("");
      console.error(
        colors.error(
          "Error: Ran out of memory while indexing. The repository may be too large for the default heap.",
        ),
      );
      console.error("");
      console.error(`${symbols.warning} ${colors.warning("Try increasing the Node.js heap:")}`);
      console.error(
        `  NODE_OPTIONS='--max-old-space-size=4096' knowledgine init${options.path ? ` --path ${options.path}` : ""}`,
      );
      console.error("");
      console.error(
        `${symbols.info} ${colors.info("For very large repositories (10,000+ files), use 8GB or more:")}`,
      );
      console.error(
        `  NODE_OPTIONS='--max-old-space-size=8192' knowledgine init${options.path ? ` --path ${options.path}` : ""}`,
      );
      db.close();
      process.exit(1);
    }
    throw err;
  }

  if (ingestSummary.processed === 0) {
    stepProgress.warn("No markdown files found in the directory.");

    // Suggest ingest sources if this is a git repository
    try {
      const { execFileSync } = await import("child_process");
      execFileSync("git", ["rev-parse", "--git-dir"], { cwd: rootPath, stdio: "ignore" });
      // It's a git repo - suggest ingest sources
      console.error("");
      console.error(
        `${symbols.info} ${colors.info("This is a git repository. Enrich your knowledge base:")}`,
      );
      console.error(
        `  ${symbols.arrow} ${colors.hint(`knowledgine ingest --source git-history --path ${rootPath}`)}`,
      );
      console.error(
        `  ${symbols.arrow} ${colors.hint(`knowledgine ingest --source github --repo <owner/repo> --path ${rootPath}`)}`,
      );
      console.error("");
    } catch {
      // Not a git repo - no additional hint
    }
  }

  if (ingestSummary.errors > 0) {
    stepProgress.warn(`${ingestSummary.errors} file(s) could not be indexed`);
    if (ingestSummary.errorDetails && ingestSummary.errorDetails.length > 0) {
      const displayCount = options.verbose
        ? ingestSummary.errorDetails.length
        : Math.min(5, ingestSummary.errorDetails.length);
      for (let i = 0; i < displayCount; i++) {
        const e = ingestSummary.errorDetails[i];
        console.error(`    [${e.category}] ${e.sourceUri} — ${e.message}`);
      }
      if (!options.verbose && ingestSummary.errorDetails.length > 5) {
        console.error(
          `    ... and ${ingestSummary.errorDetails.length - 5} more (use --verbose to see all)`,
        );
      }
    }
  }

  if (options.verbose && ingestSummary.skipDetails && ingestSummary.skipDetails.length > 0) {
    console.error(`  Skipped files:`);
    for (const detail of ingestSummary.skipDetails) {
      console.error(`    [${formatSkipReason(detail.reason)}] ${detail.path}`);
    }
  }

  stepProgress.completeStep("Indexing markdown files");

  // Entity extraction (post-ingest batch)
  const extractor = new IncrementalExtractor(repository, graphRepository);
  const allNoteIds = ingestSummary.noteIds ?? repository.getAllNoteIds();
  const postSummary = await extractor.process(allNoteIds);

  // ---------------------------------------------------------------------------
  // Auto-detect semantic search capability (when not explicitly set)
  // ---------------------------------------------------------------------------
  const SEMANTIC_AUTO_THRESHOLD = 5000;
  if (!enableSemantic && !semanticExplicitlyDisabled && ingestSummary.processed > 0) {
    const modelManager = new ModelManager();
    if (modelManager.isModelAvailable()) {
      if (ingestSummary.processed < SEMANTIC_AUTO_THRESHOLD) {
        // Auto-enable for small repos
        enableSemantic = true;
        config.embedding.enabled = true;
        try {
          await loadSqliteVecExtension(db);
        } catch {
          enableSemantic = false;
          config.embedding.enabled = false;
        }
      } else if (options.yes) {
        // --yes flag: auto-accept
        enableSemantic = true;
        config.embedding.enabled = true;
        try {
          await loadSqliteVecExtension(db);
        } catch {
          enableSemantic = false;
          config.embedding.enabled = false;
        }
      } else {
        // Large repo: prompt user
        const shouldEnable = await p.confirm({
          message: `Enable semantic search? (${ingestSummary.processed} notes, estimated ~${Math.ceil(ingestSummary.processed / 150)}s)`,
        });
        if (shouldEnable && !p.isCancel(shouldEnable)) {
          enableSemantic = true;
          config.embedding.enabled = true;
          try {
            await loadSqliteVecExtension(db);
          } catch {
            enableSemantic = false;
            config.embedding.enabled = false;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4 & 5 (semantic only): Download model + generate embeddings
  // ---------------------------------------------------------------------------
  if (enableSemantic && config.embedding.enabled) {
    const modelManager = new ModelManager();

    // Step 4: Download model if not already available
    if (!modelManager.isModelAvailable()) {
      stepProgress.startStep("Downloading embedding model");

      let lastError: Error | null = null;
      let downloadSucceeded = false;

      for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
        try {
          await downloadModel(modelManager, {
            onProgress: (progress) => {
              if (progress.total) {
                const mb = (progress.downloaded / (1024 * 1024)).toFixed(1);
                const totalMb = (progress.total / (1024 * 1024)).toFixed(1);
                process.stderr.write(`\r  ${progress.file}: ${mb}/${totalMb} MB`);
              }
            },
            onFileComplete: (file) => {
              process.stderr.write(`\r  [done] ${file}          \n`);
            },
          });
          downloadSucceeded = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const isNetworkError =
            lastError.message.includes("ENOTFOUND") ||
            lastError.message.includes("ETIMEDOUT") ||
            lastError.message.includes("ECONNRESET") ||
            lastError.message.includes("network") ||
            lastError.message.includes("fetch");

          if (isNetworkError && attempt < MAX_DOWNLOAD_RETRIES) {
            const backoffMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
            stepProgress.warn(
              `Download attempt ${attempt}/${MAX_DOWNLOAD_RETRIES} failed (${lastError.message}). Retrying in ${backoffMs / 1000}s...`,
            );
            await sleep(backoffMs);
          } else {
            break;
          }
        }
      }

      if (!downloadSucceeded) {
        const message = lastError instanceof Error ? lastError.message : "unknown error";
        stepProgress.failStep("Downloading embedding model", message);
        console.error("");
        console.error(
          colors.error("Semantic search unavailable. Text search (FTS5) works without embeddings."),
        );
        console.error(colors.error(`To retry: knowledgine init --path ${rootPath} --semantic`));
        console.error("");
        console.error(
          `${symbols.info} ${colors.info("Offline alternative: Copy the model files manually to:")}`,
        );
        console.error(`  ${modelManager.getModelDir()}`);
        console.error("  Then re-run the init command.");

        // Still print summary for what was indexed
        console.error("");
        console.error("knowledgine initialized (without embeddings).");
        console.error(`  Notes:      ${ingestSummary.processed} indexed`);
        console.error(`  Patterns:   ${postSummary.totalEntities} entities extracted`);
        console.error(`  Embeddings: skipped (model download failed)`);
        console.error("");
        console.error(
          `${symbols.arrow} ${colors.hint("Next: Run 'knowledgine setup' to connect your AI tool.")}`,
        );
        db.close();
        return;
      }

      stepProgress.completeStep("Downloading embedding model");
    } else {
      stepProgress.skipStep("Downloading embedding model", "already available");
    }

    // Step 5: Generate embeddings
    stepProgress.startStep("Generating embeddings");
    if (modelManager.isModelAvailable()) {
      const embeddingProvider = new OnnxEmbeddingProvider(DEFAULT_MODEL_NAME, modelManager);
      const noteIds = repository.getNotesWithoutEmbeddingIds();

      if (noteIds.length > 0) {
        const BATCH_SIZE = 20;
        const embProgress = createProgress(noteIds.length, "  Embeddings");
        let generated = 0;
        let failed = 0;

        const MAX_EMBED_RETRIES = 2;

        for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
          const batchIds = noteIds.slice(i, i + BATCH_SIZE);
          const noteRows = repository.getNotesByIds(batchIds);
          // getNotesByIds の返り順は不定なので id→note Map で安全にマッピング
          const noteMap = new Map(noteRows.map((n) => [n.id, n]));
          const orderedNotes = batchIds.map((id) => noteMap.get(id)).filter((n) => n != null);

          for (let attempt = 0; attempt <= MAX_EMBED_RETRIES; attempt++) {
            try {
              const embeddings = await embeddingProvider.embedBatch(
                orderedNotes.map((n) => buildEmbeddingInput(n)),
              );
              const result = repository.saveEmbeddingBatch(
                orderedNotes.map((n, j) => ({
                  noteId: n.id,
                  embedding: embeddings[j],
                  modelName: config.embedding.modelName,
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
          embProgress.update(
            generated + failed > noteIds.length ? noteIds.length : generated + failed,
          );
        }

        embProgress.finish();
        if (failed > 0) {
          stepProgress.warn(`${failed} embedding(s) could not be generated`);
        }
      }
    }

    stepProgress.completeStep("Generating embeddings");
  } else {
    // Skip semantic steps when not enabled
    stepProgress.skipStep("Downloading embedding model", "semantic search not enabled");
    stepProgress.skipStep("Generating embeddings", "semantic search not enabled");
  }

  stepProgress.finish();

  // ---------------------------------------------------------------------------
  // Persist semantic: true when embeddings were generated (reflects DB state)
  // Same pattern as upgrade --semantic (unconditional write)
  // ---------------------------------------------------------------------------
  if (enableSemantic && config.embedding.enabled) {
    writeRcConfig(rootPath, { semantic: true });
  }

  // ---------------------------------------------------------------------------
  // Write defaultPath only when explicitly requested (--save-config + --path)
  // ---------------------------------------------------------------------------
  if (options.saveConfig) {
    const cwd = process.cwd();
    const resolvedRoot = resolve(rootPath);
    // Only write defaultPath when --path was explicitly provided by user,
    // preventing resolveDefaultPath inferred paths from being written back
    if (options.path && resolvedRoot !== resolve(cwd)) {
      writeRcConfig(cwd, { defaultPath: resolvedRoot });
    }
  }

  // ---------------------------------------------------------------------------
  // Final summary
  // ---------------------------------------------------------------------------
  const stats = repository.getStats();
  const notesWithoutEmb = repository.getNotesWithoutEmbeddings().length;
  const embeddingsGenerated = stats.totalNotes - notesWithoutEmb;

  const elapsed = formatDuration(Date.now() - initStartTime);
  let skippedValue: string | undefined;
  if (ingestSummary.skipped > 0) {
    if (ingestSummary.skippedByReason && Object.keys(ingestSummary.skippedByReason).length > 0) {
      const parts = Object.entries(ingestSummary.skippedByReason)
        .filter(([, count]) => count && count > 0)
        .map(([reason, count]) => `${count} ${formatSkipReason(reason)}`);
      skippedValue = `${ingestSummary.skipped} files (${parts.join(", ")})`;
    } else {
      skippedValue = `${ingestSummary.skipped} files`;
    }
  }

  const summaryEntries = [
    { label: "Notes:", value: `${stats.totalNotes} indexed` },
    ...(skippedValue !== undefined ? [{ label: "Skipped:", value: skippedValue }] : []),
    { label: "Patterns:", value: `${stats.totalPatterns} extracted` },
    { label: "Entities:", value: `${postSummary.totalEntities} extracted` },
    ...(enableSemantic && config.embedding.enabled
      ? (() => {
          const coveragePct =
            stats.totalNotes > 0 ? Math.round((embeddingsGenerated / stats.totalNotes) * 100) : 100;
          return [
            {
              label: "Embeddings:",
              value: embeddingsGenerated > 0 ? `${embeddingsGenerated} generated` : "none",
            },
            ...(coveragePct < 95 && stats.totalNotes > 0
              ? [
                  {
                    label: "Hint:",
                    value: `Run 'knowledgine ingest --embed-missing' to complete embedding generation`,
                  },
                ]
              : []),
          ];
        })()
      : [
          { label: "Search:", value: "FTS5 full-text search (default)" },
          {
            label: "Hint:",
            value: "Run 'knowledgine upgrade --semantic' to enable semantic search",
          },
        ]),
    { label: "Duration:", value: elapsed },
  ];
  // Summary as clack note for visual consistency
  const summaryLines = summaryEntries.map((e) => `${colors.dim(e.label.padEnd(12))} ${e.value}`);
  p.note(summaryLines.join("\n"), "knowledgine init");

  if (options.demo) {
    p.note(
      [
        `${symbols.arrow} ${colors.info('knowledgine search "auth" --demo')}`,
        `${symbols.arrow} ${colors.info('knowledgine search "typescript" --demo')}`,
        `${symbols.arrow} ${colors.info('knowledgine search "docker" --demo')}`,
        "",
        `${colors.dim("knowledgine demo --clean  to remove demo files")}`,
      ].join("\n"),
      "Try these searches",
    );
  } else {
    const nextStepLines = [
      `${symbols.arrow} ${colors.info("knowledgine setup")}          ${colors.dim("Configure your AI tools")}`,
      `${symbols.arrow} ${colors.info('knowledgine search "query"')}  ${colors.dim("Search your notes")}`,
    ];
    if (options.saveConfig) {
      nextStepLines.push(
        `${symbols.arrow} ${colors.info(`knowledgine setup --target claude-code --path ${rootPath} --write`)}`,
        `${symbols.arrow} ${colors.info(`knowledgine start --path ${rootPath}`)}`,
      );
    } else if (resolve(rootPath) !== resolve(process.cwd())) {
      nextStepLines.push(
        "",
        `${colors.dim("Tip: Use --save-config to save the path so you don't need --path every time.")}`,
      );
    }
    p.note(nextStepLines.join("\n"), "Next steps");
  }

  // Suggest adding .knowledgine/ to .gitignore
  const gitignorePath = join(rootPath, ".gitignore");
  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, "utf-8");
    if (!gitignoreContent.includes(".knowledgine")) {
      p.note(
        "Add '.knowledgine/' to your .gitignore to exclude the knowledge base from version control.",
        ".gitignore suggestion",
      );
    }
  } else {
    p.note(
      "Consider creating a .gitignore file with '.knowledgine/' to exclude the knowledge base from version control.",
      ".gitignore suggestion",
    );
  }

  p.outro(`${colors.success("Your knowledge is now searchable!")} ${colors.dim(`(${elapsed})`)}`);

  console.error("");
  console.error(`  → Next: knowledgine ingest --all --path ${rootPath}`);

  db.close();
}
