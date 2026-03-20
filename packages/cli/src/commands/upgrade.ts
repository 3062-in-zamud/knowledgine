import { resolve } from "path";
import { existsSync } from "fs";
import {
  loadConfig,
  writeRcConfig,
  createDatabase,
  loadSqliteVecExtension,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
  downloadModel,
} from "@knowledgine/core";
import { createProgress } from "../lib/progress.js";

export interface UpgradeOptions {
  semantic?: boolean;
  path?: string;
}

export async function upgradeCommand(options: UpgradeOptions): Promise<void> {
  const rootPath = resolve(options.path ?? process.cwd());

  if (!options.semantic) {
    console.error("Usage: knowledgine upgrade --semantic");
    console.error("");
    console.error("Available upgrades:");
    console.error("  --semantic   Enable semantic search (download model + generate embeddings)");
    return;
  }

  // Check initialization
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(`Error: Not initialized. Run 'knowledgine init --path ${rootPath}' first.`);
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(rootPath);
  config.embedding.enabled = true;

  const db = createDatabase(config.dbPath);
  await loadSqliteVecExtension(db);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);

  // Download model
  const modelManager = new ModelManager();
  if (!modelManager.isModelAvailable()) {
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
      console.error("Semantic search upgrade aborted.");
      db.close();
      process.exitCode = 1;
      return;
    }
  } else {
    console.error("Embedding model already available.");
  }

  // Generate embeddings for notes that don't have them
  const embeddingProvider = new OnnxEmbeddingProvider(undefined, modelManager);
  const notesWithout = repository.getNotesWithoutEmbeddings();

  if (notesWithout.length > 0) {
    console.error("");
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
    console.error(`  Generated: ${generated}, Failed: ${failed}`);
  } else {
    console.error("All notes already have embeddings.");
  }

  // Write .knowledginerc.json
  writeRcConfig(rootPath, { semantic: true });

  console.error("");
  console.error("Semantic search enabled successfully.");
  console.error("  Config: .knowledginerc.json written (semantic: true)");
  console.error("");
  console.error("Restart the MCP server to activate semantic search.");

  db.close();
}
