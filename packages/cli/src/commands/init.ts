import { resolve } from "path";
import { mkdirSync } from "fs";
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
import { createProgress, formatDuration } from "../lib/progress.js";
import { copyDemoFixtures } from "../lib/demo-manager.js";
import { getDemoNotesPath } from "./demo.js";

export interface InitOptions {
  path?: string;
  semantic?: boolean;
  skipEmbeddings?: boolean;
  demo?: boolean;
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

  // Create .knowledgine directory
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  mkdirSync(knowledgineDir, { recursive: true });

  // Initialize database
  const config = loadConfig(rootPath);
  if (enableSemantic) {
    config.embedding.enabled = true;
  }
  const db = createDatabase(config.dbPath);

  // Load sqlite-vec extension if semantic search is enabled
  if (enableSemantic) {
    await loadSqliteVecExtension(db);
  }

  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);

  // Index all markdown files (with entity extraction and progress)
  let indexProgress: ReturnType<typeof createProgress> | null = null;

  const summary = await indexAll(rootPath, repository, graphRepository, {
    onProgress: (current, total, filePath) => {
      if (!indexProgress) {
        console.error(`Found ${total} markdown files`);
        indexProgress = createProgress(total, "Indexing");
      }
      indexProgress.update(current, filePath);
    },
  });

  if (summary.totalFiles === 0) {
    console.error("No markdown files found.");
  }

  console.error(
    `Indexing complete (${formatDuration(summary.elapsedMs)}): ${summary.processedFiles} files, ${summary.totalPatterns} patterns`,
  );

  if (summary.errors.length > 0) {
    console.error(`  Errors: ${summary.errors.length}`);
    for (const err of summary.errors) {
      console.error(`    - ${err}`);
    }
  }

  // Generate embeddings only when --semantic flag is set
  if (enableSemantic) {
    const modelManager = new ModelManager();

    // Auto-download model if not available
    if (!modelManager.isModelAvailable()) {
      console.error("");
      console.error("Downloading embedding model (~23MB)...");
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
        console.error("Model download complete.");
      } catch (error) {
        console.error(
          `\nModel download failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.error(
          "Semantic search unavailable. Text search (FTS5) works without embeddings.",
        );
        console.error(`To retry: knowledgine init --path ${rootPath} --semantic`);
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
    }

    // Generate embeddings
    if (modelManager.isModelAvailable()) {
      console.error("");
      const embeddingProvider = new OnnxEmbeddingProvider(undefined, modelManager);
      const notesWithout = repository.getNotesWithoutEmbeddings();

      if (notesWithout.length > 0) {
        const embProgress = createProgress(notesWithout.length, "Generating embeddings");
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
          console.error(`  (${failed} failed)`);
        }
      }
    }

    // Write .knowledginerc.json to persist semantic search setting
    writeRcConfig(rootPath, { semantic: true });
    console.error("  Config: .knowledginerc.json written (semantic: true)");
  }

  // Final summary
  const notesWithoutEmb = repository.getNotesWithoutEmbeddings().length;
  const embeddingsGenerated = summary.processedFiles - notesWithoutEmb;

  console.error("");
  console.error("knowledgine initialized successfully.");
  console.error(`  Notes:      ${summary.processedFiles} indexed`);
  console.error(`  Patterns:   ${summary.totalPatterns} extracted`);
  if (enableSemantic) {
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
