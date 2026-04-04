import { resolve } from "path";
import { existsSync } from "fs";
import {
  loadConfig,
  writeRcConfig,
  resolveDefaultPath,
  createDatabase,
  loadSqliteVecExtension,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
  DEFAULT_MODEL_NAME,
  downloadModel,
} from "@knowledgine/core";
import { createProgress } from "../lib/progress.js";
import { colors, symbols, createBox } from "../lib/ui/index.js";

export interface UpgradeOptions {
  semantic?: boolean;
  reindex?: boolean;
  path?: string;
}

export async function upgradeCommand(options: UpgradeOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);

  if (!options.semantic && !options.reindex) {
    console.error("Usage: knowledgine upgrade --semantic");
    console.error("       knowledgine upgrade --reindex");
    console.error("");
    console.error("Available upgrades:");
    console.error("  --semantic   Enable semantic search (download model + generate embeddings)");
    console.error(
      "  --reindex    Delete and regenerate all embeddings (use after switching models)",
    );
    return;
  }

  // Check initialization
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(
      colors.error(`Error: Not initialized. Run 'knowledgine init --path ${rootPath}' first.`),
    );
    process.exitCode = 1;
    return;
  }

  if (options.reindex) {
    await reindexCommand(rootPath);
    return;
  }

  const config = loadConfig(rootPath);
  config.embedding.enabled = true;

  const db = createDatabase(config.dbPath);
  const vecLoaded = await loadSqliteVecExtension(db);
  new Migrator(db, ALL_MIGRATIONS).migrate();

  const repository = new KnowledgeRepository(db);
  if (vecLoaded) {
    const synced = repository.syncMissingVectorsFromEmbeddings();
    if (synced > 0) {
      console.error(`Synced ${synced} embeddings into vector index.`);
    }
  }

  // Check for mixed models warning
  const consistency = repository.checkEmbeddingModelConsistency(DEFAULT_MODEL_NAME);
  if (!consistency.consistent) {
    console.error(
      colors.warning(
        `Warning: Existing embeddings use different model(s): ${consistency.existingModels.join(", ")}`,
      ),
    );
    console.error(
      colors.warning(
        `Semantic search may produce incorrect results. Run 'knowledgine upgrade --reindex' to fix.`,
      ),
    );
  }

  // Download model
  const modelManager = new ModelManager();
  if (!modelManager.isModelAvailable()) {
    console.error(colors.info("Downloading embedding model (~33MB)..."));
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
          process.stderr.write(`\r  ${symbols.success} ${file}          \n`);
        },
      });
      console.error(`${symbols.success} ${colors.success("Model download complete.")}`);
    } catch {
      console.error(
        colors.error("\nModel download failed. Check your network connection and try again."),
      );
      console.error(colors.error("Semantic search upgrade aborted."));
      db.close();
      process.exitCode = 1;
      return;
    }
  } else {
    console.error(`${symbols.success} ${colors.success("Embedding model already available.")}`);
  }

  // Generate embeddings for notes that don't have them
  const embeddingProvider = new OnnxEmbeddingProvider(DEFAULT_MODEL_NAME, modelManager);
  const noteIds = repository.getNotesWithoutEmbeddingIds();

  if (noteIds.length > 0) {
    // Warm up the ONNX session (first call is slow due to model loading)
    console.error(colors.info("\nLoading embedding model..."));
    await embeddingProvider.embed("warmup");
    console.error("");

    const BATCH_SIZE = 20;
    const embProgress = createProgress(noteIds.length, "Generating embeddings");
    let generated = 0;
    let failed = 0;

    for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
      const batchIds = noteIds.slice(i, i + BATCH_SIZE);
      const noteRows = repository.getNotesByIds(batchIds);
      // getNotesByIds の返り順は不定なので id→note Map で安全にマッピング
      const noteMap = new Map(noteRows.map((n) => [n.id, n]));
      const orderedNotes = batchIds.map((id) => noteMap.get(id)).filter((n) => n != null);
      try {
        const embeddings = await embeddingProvider.embedBatch(orderedNotes.map((n) => n.content));
        const result = repository.saveEmbeddingBatch(
          orderedNotes.map((n, j) => ({
            noteId: n.id,
            embedding: embeddings[j],
            modelName: config.embedding.modelName,
          })),
        );
        generated += result.saved;
        failed += result.failed;
      } catch {
        failed += orderedNotes.length;
      }
      embProgress.update(generated + failed > noteIds.length ? noteIds.length : generated + failed);
    }

    embProgress.finish();
    console.error(
      `  ${symbols.success} ${colors.success(`Generated: ${generated}`)}, Failed: ${failed}`,
    );
  } else {
    console.error(`${symbols.success} ${colors.success("All notes already have embeddings.")}`);
  }

  // Write .knowledginerc.json
  writeRcConfig(rootPath, { semantic: true });

  console.error(
    "\n" +
      createBox(
        [
          `${symbols.success} ${colors.success("Semantic search enabled")}`,
          `  Config: .knowledginerc.json written`,
          "",
          `${symbols.arrow} ${colors.hint("Restart MCP server to activate.")}`,
        ].join("\n"),
        { title: "Upgrade Complete", type: "success" },
      ),
  );

  db.close();
}

/**
 * --reindex: 既存の埋め込みをすべて削除し、現在のモデルで再生成する
 */
async function reindexCommand(rootPath: string): Promise<void> {
  const config = loadConfig(rootPath);

  const db = createDatabase(config.dbPath);
  await loadSqliteVecExtension(db);
  new Migrator(db, ALL_MIGRATIONS).migrate();

  const repository = new KnowledgeRepository(db);
  const modelManager = new ModelManager();

  // Download model if not available
  if (!modelManager.isModelAvailable()) {
    console.error(colors.info(`Downloading embedding model (${DEFAULT_MODEL_NAME})...`));
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
          process.stderr.write(`\r  ${symbols.success} ${file}          \n`);
        },
      });
      console.error(`${symbols.success} ${colors.success("Model download complete.")}`);
    } catch {
      console.error(
        colors.error("\nModel download failed. Check your network connection and try again."),
      );
      db.close();
      process.exitCode = 1;
      return;
    }
  }

  // Delete all existing embeddings
  const deleted = repository.deleteAllEmbeddings();
  console.error(colors.info(`Deleted ${deleted} existing embeddings.`));

  // Get all note IDs
  const noteIds = repository.getAllNoteIds();

  if (noteIds.length === 0) {
    console.error(colors.info("No notes to reindex."));
    db.close();
    return;
  }

  console.error(colors.info(`\nReindexing ${noteIds.length} notes with ${DEFAULT_MODEL_NAME}...`));

  const embeddingProvider = new OnnxEmbeddingProvider(DEFAULT_MODEL_NAME, modelManager);

  // Warm up
  await embeddingProvider.embed("warmup");

  const BATCH_SIZE = 20;
  const embProgress = createProgress(noteIds.length, "Reindexing");
  let generated = 0;
  let failed = 0;

  for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
    const batchIds = noteIds.slice(i, i + BATCH_SIZE);
    const noteRows = repository.getNotesByIds(batchIds);
    const noteMap = new Map(noteRows.map((n) => [n.id, n]));
    const orderedNotes = batchIds.map((id) => noteMap.get(id)).filter((n) => n != null);
    try {
      const embeddings = await embeddingProvider.embedBatch(orderedNotes.map((n) => n.content));
      const result = repository.saveEmbeddingBatch(
        orderedNotes.map((n, j) => ({
          noteId: n.id,
          embedding: embeddings[j],
          modelName: DEFAULT_MODEL_NAME,
        })),
      );
      generated += result.saved;
      failed += result.failed;
    } catch {
      failed += orderedNotes.length;
    }
    embProgress.update(generated + failed > noteIds.length ? noteIds.length : generated + failed);
  }

  embProgress.finish();
  console.error(
    `  ${symbols.success} ${colors.success(`Reindexed: ${generated}`)}, Failed: ${failed}`,
  );

  console.error(
    "\n" +
      createBox(
        [
          `${symbols.success} ${colors.success("Reindex complete")}`,
          `  Model: ${DEFAULT_MODEL_NAME}`,
          `  Notes: ${generated}/${noteIds.length}`,
          "",
          `${symbols.arrow} ${colors.hint("Restart MCP server to activate.")}`,
        ].join("\n"),
        { title: "Reindex Complete", type: "success" },
      ),
  );

  db.close();
}
