import { resolve } from "path";
import { mkdirSync } from "fs";
import {
  defineConfig,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
} from "@knowledgine/core";
import { indexAll } from "../lib/indexer.js";

export interface InitOptions {
  path?: string;
  skipEmbeddings?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const rootPath = resolve(options.path ?? process.cwd());

  // Create .knowledgine directory
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  mkdirSync(knowledgineDir, { recursive: true });

  // Initialize database (sqlite-vec loaded inside createDatabase)
  const config = defineConfig({ rootPath });
  const db = createDatabase(config.dbPath, { enableVec: true });
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);

  // Index all markdown files (with entity extraction)
  console.error("Indexing markdown files...");
  const summary = await indexAll(rootPath, repository, graphRepository);

  // Display summary (stderr to avoid MCP stdout conflicts)
  console.error(`Indexing complete:`);
  console.error(`  Files:    ${summary.processedFiles}/${summary.totalFiles}`);
  console.error(`  Patterns: ${summary.totalPatterns}`);
  console.error(`  Time:     ${summary.elapsedMs}ms`);

  if (summary.errors.length > 0) {
    console.error(`  Errors:   ${summary.errors.length}`);
    for (const err of summary.errors) {
      console.error(`    - ${err}`);
    }
  }

  // Generate embeddings if not skipped
  if (!options.skipEmbeddings) {
    const modelManager = new ModelManager();
    if (modelManager.isModelAvailable()) {
      console.error("Generating embeddings...");
      const embeddingProvider = new OnnxEmbeddingProvider(undefined, modelManager);
      const notesWithout = repository.getNotesWithoutEmbeddings();

      let generated = 0;
      let failed = 0;
      for (const note of notesWithout) {
        try {
          const embedding = await embeddingProvider.embed(note.content);
          repository.saveEmbedding(note.id, embedding, config.embedding.modelName);
          generated++;
          if (generated % 10 === 0) {
            console.error(`  Embeddings: ${generated}/${notesWithout.length}`);
          }
        } catch {
          failed++;
        }
      }
      console.error(`  Embeddings: ${generated} generated, ${failed} failed`);
    } else {
      console.error("Skipping embeddings: model not found. Run: node scripts/download-model.js");
    }
  } else {
    console.error("Skipping embeddings (--skip-embeddings flag set).");
  }

  db.close();
}
