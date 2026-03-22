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
  DEFAULT_MODEL_NAME,
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
  const vecLoaded = await loadSqliteVecExtension(db);
  new Migrator(db, ALL_MIGRATIONS).migrate();

  // Ensure vec0 virtual table exists and is populated
  if (vecLoaded) {
    // Create vec table if it doesn't exist
    try {
      db.prepare("SELECT COUNT(*) FROM note_embeddings_vec").get();
    } catch {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings_vec USING vec0(
          note_id INTEGER PRIMARY KEY,
          embedding FLOAT[384]
        );
        CREATE TRIGGER IF NOT EXISTS note_embeddings_ad AFTER DELETE ON note_embeddings BEGIN
          DELETE FROM note_embeddings_vec WHERE note_id = old.note_id;
        END;
      `);
    }

    // Backfill: sync embeddings that exist in note_embeddings but not in note_embeddings_vec
    const vecCount = (
      db.prepare("SELECT COUNT(*) as c FROM note_embeddings_vec").get() as { c: number }
    ).c;
    const embCount = (
      db.prepare("SELECT COUNT(*) as c FROM note_embeddings").get() as { c: number }
    ).c;

    if (embCount > 0 && vecCount < embCount) {
      // Find embeddings missing from vec table
      const missing = db
        .prepare(
          `
        SELECT e.note_id, e.embedding FROM note_embeddings e
        WHERE e.note_id NOT IN (SELECT note_id FROM note_embeddings_vec)
      `,
        )
        .all() as Array<{ note_id: number; embedding: Buffer }>;

      if (missing.length > 0) {
        const insert = db.prepare(
          "INSERT INTO note_embeddings_vec (note_id, embedding) VALUES (CAST(? AS INTEGER), ?)",
        );
        const tx = db.transaction(() => {
          for (const row of missing) {
            insert.run(row.note_id, row.embedding);
          }
        });
        tx();
        console.error(`Synced ${missing.length} embeddings into vector index.`);
      }
    }
  }

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
  const embeddingProvider = new OnnxEmbeddingProvider(DEFAULT_MODEL_NAME, modelManager);
  const notesWithout = repository.getNotesWithoutEmbeddings();

  if (notesWithout.length > 0) {
    // Warm up the ONNX session (first call is slow due to model loading)
    console.error("\nLoading embedding model...");
    await embeddingProvider.embed("warmup");
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
