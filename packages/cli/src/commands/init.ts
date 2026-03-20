import { resolve } from "path";
import { mkdirSync, statSync } from "fs";
import {
  loadConfig,
  writeRcConfig,
  createDatabase,
  loadSqliteVecExtension,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
  downloadModel,
} from "@knowledgine/core";
import { indexAll } from "../lib/indexer.js";
import { createProgress, createStepProgress } from "../lib/progress.js";
import { copyDemoFixtures } from "../lib/demo-manager.js";
import { getDemoNotesPath } from "./demo.js";

export interface InitOptions {
  path?: string;
  semantic?: boolean;
  skipEmbeddings?: boolean;
  demo?: boolean;
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

export async function initCommand(options: InitOptions): Promise<void> {
  let rootPath: string;

  if (options.demo) {
    const demoPath = getDemoNotesPath(options.path);
    const count = copyDemoFixtures(demoPath);
    console.error(`Copied ${count} demo notes to ${demoPath}`);
    rootPath = demoPath;
  } else {
    rootPath = resolve(options.path ?? process.cwd());
  }

  // Deprecation warning for --skip-embeddings
  if (options.skipEmbeddings) {
    console.error(
      "Warning: --skip-embeddings is deprecated. Embeddings are now opt-in by default.",
    );
    console.error("  Use 'knowledgine init --semantic' to enable semantic search.");
    console.error("");
  }

  // Determine if semantic search should be enabled
  const enableSemantic = options.semantic === true;

  // ---------------------------------------------------------------------------
  // Step 1: Create .knowledgine directory
  // ---------------------------------------------------------------------------
  const totalSteps = enableSemantic ? 5 : 3;
  const stepProgress = createStepProgress(totalSteps, "Initializing knowledgine...");

  const knowledgineDir = resolve(rootPath, ".knowledgine");

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
      stepProgress.failStep(
        "Creating .knowledgine directory",
        "Insufficient disk space",
      );
      console.error("");
      console.error("Error: Disk is full. Cannot create the knowledge base.");
      console.error("");
      console.error("Disk space requirements:");
      console.error(
        `  FTS5 text search only: source files x${DISK_MULTIPLIER_FTS5} (index overhead)`,
      );
      if (enableSemantic) {
        console.error(
          `  Semantic search (+--semantic): +${(SEMANTIC_MODEL_BYTES / (1024 * 1024)).toFixed(0)} MB (embedding model) + vector index`,
        );
      }
      if (estimatedNeeded > 0) {
        console.error(
          `  Estimated needed: ~${(estimatedNeeded / (1024 * 1024)).toFixed(1)} MB`,
        );
      }
      if (freeDisk < Infinity) {
        console.error(
          `  Available:        ~${(freeDisk / (1024 * 1024)).toFixed(1)} MB`,
        );
      }
      console.error("");
      console.error("Free up disk space and re-run:");
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
      stepProgress.failStep("Initializing database", `sqlite-vec extension unavailable: ${message}`);
      stepProgress.warn("Falling back to FTS5-only mode (no vector search)");
      // Continue without semantic — we degrade gracefully
      config.embedding.enabled = false;
    }
  }

  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);
  stepProgress.completeStep("Initializing database");

  // ---------------------------------------------------------------------------
  // Step 3: Index markdown files
  // ---------------------------------------------------------------------------
  stepProgress.startStep("Indexing markdown files");
  let indexProgress: import("../lib/progress.js").Progress | null = null;

  const summary = await indexAll(rootPath, repository, graphRepository, {
    onProgress: (current, total, filePath) => {
      if (!indexProgress) {
        console.error(`  Found ${total} markdown files`);
        indexProgress = createProgress(total, "  Indexing");
      }
      indexProgress.update(current, filePath);
    },
  });

  if (indexProgress !== null) {
    // Print a newline after the in-place progress bar
    (indexProgress as import("../lib/progress.js").Progress).finish();
  }

  if (summary.totalFiles === 0) {
    stepProgress.warn("No markdown files found in the directory.");
  }

  if (summary.errors.length > 0) {
    // File read failures are non-fatal: log as warnings and continue
    for (const err of summary.errors) {
      stepProgress.warn(`Skipped (read error): ${err}`);
    }
  }

  stepProgress.completeStep("Indexing markdown files");

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
        const message =
          lastError instanceof Error ? lastError.message : "unknown error";
        stepProgress.failStep("Downloading embedding model", message);
        console.error("");
        console.error("Semantic search unavailable. Text search (FTS5) works without embeddings.");
        console.error(`To retry: knowledgine init --path ${rootPath} --semantic`);
        console.error("");
        console.error("Offline alternative: Copy the model files manually to:");
        console.error(`  ${modelManager.getModelDir()}`);
        console.error("  Then re-run the init command.");

        // Still print summary for what was indexed
        console.error("");
        console.error("knowledgine initialized (without embeddings).");
        console.error(`  Notes:      ${summary.processedFiles} indexed`);
        console.error(`  Patterns:   ${summary.totalPatterns} extracted`);
        console.error(`  Embeddings: skipped (model download failed)`);
        console.error("");
        console.error("Next: Run 'knowledgine setup' to connect your AI tool.");
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
      const embeddingProvider = new OnnxEmbeddingProvider(undefined, modelManager);
      const notesWithout = repository.getNotesWithoutEmbeddings();

      if (notesWithout.length > 0) {
        const embProgress = createProgress(notesWithout.length, "  Embeddings");
        let generated = 0;
        let failed = 0;

        for (const note of notesWithout) {
          try {
            const embedding = await embeddingProvider.embed(note.content);
            repository.saveEmbedding(note.id, embedding, config.embedding.modelName);
            generated++;
            embProgress.update(generated);
          } catch {
            failed++;
          }
        }

        embProgress.finish();
        if (failed > 0) {
          stepProgress.warn(`${failed} embedding(s) could not be generated`);
        }
      }
    }

    // Write .knowledginerc.json to persist semantic search setting
    writeRcConfig(rootPath, { semantic: true });
    stepProgress.completeStep("Generating embeddings");
  }

  stepProgress.finish();

  // ---------------------------------------------------------------------------
  // Final summary
  // ---------------------------------------------------------------------------
  const notesWithoutEmb = repository.getNotesWithoutEmbeddings().length;
  const embeddingsGenerated = summary.processedFiles - notesWithoutEmb;

  console.error("");
  console.error("knowledgine initialized successfully.");
  console.error(`  Notes:      ${summary.processedFiles} indexed`);
  console.error(`  Patterns:   ${summary.totalPatterns} extracted`);
  if (enableSemantic && config.embedding.enabled) {
    console.error(
      `  Embeddings: ${embeddingsGenerated > 0 ? `${embeddingsGenerated} generated` : "none"}`,
    );
  } else {
    console.error("  Search:     FTS5 full-text search (default)");
    console.error("  Hint:       Run 'knowledgine upgrade --semantic' to enable semantic search");
  }
  console.error("");
  if (options.demo) {
    console.error("Demo ready! Try:");
    console.error('  knowledgine search "auth" --demo');
    console.error('  knowledgine search "typescript" --demo');
    console.error('  knowledgine search "docker" --demo');
    console.error("");
    console.error("Clean up when done:");
    console.error("  knowledgine demo --clean");
  } else {
    console.error("Next: Run 'knowledgine setup' to connect your AI tool.");
  }

  db.close();
}
