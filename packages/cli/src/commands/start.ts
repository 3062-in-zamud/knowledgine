import { resolve } from "path";
import { mkdirSync } from "fs";
import { watch } from "chokidar";
import {
  defineConfig,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  FileProcessor,
  PatternExtractor,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
} from "@knowledgine/core";
import { createKnowledgineMcpServer, StdioServerTransport } from "@knowledgine/mcp-server";
import { indexFile } from "../lib/indexer.js";

export interface StartOptions {
  path?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const rootPath = resolve(options.path ?? process.cwd());

  // Ensure .knowledgine directory exists
  mkdirSync(resolve(rootPath, ".knowledgine"), { recursive: true });

  // Initialize database + migrations (sqlite-vec loaded inside createDatabase)
  const config = defineConfig({ rootPath });
  const db = createDatabase(config.dbPath, { enableVec: true });
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);

  // Warn if no notes indexed (H-8)
  const stats = repository.getStats();
  if (stats.totalNotes === 0) {
    console.error("Warning: No notes indexed. Run `knowledgine init` first.");
  }

  // Initialize embedding provider if model is available
  let embeddingProvider: OnnxEmbeddingProvider | undefined;
  const modelManager = new ModelManager();
  if (modelManager.isModelAvailable()) {
    embeddingProvider = new OnnxEmbeddingProvider(undefined, modelManager);
  } else {
    // Warn if notes exist but no embeddings
    const notesWithout = repository.getNotesWithoutEmbeddings();
    if (notesWithout.length > 0) {
      console.error(
        `Warning: ${notesWithout.length} notes have no embeddings. ` +
          "Semantic search unavailable. Run: node scripts/download-model.js",
      );
    }
  }

  // Start MCP server via stdio
  const server = createKnowledgineMcpServer(
    repository,
    rootPath,
    embeddingProvider,
    graphRepository,
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server started on stdio");

  // File watcher for auto-reindexing
  const fileProcessor = new FileProcessor();
  const patternExtractor = new PatternExtractor();

  const watcher = watch("**/*.md", {
    cwd: rootPath,
    ignored: [/node_modules/, /\.knowledgine/],
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("add", async (filePath: string) => {
    try {
      const noteId = await indexFile(
        filePath,
        rootPath,
        fileProcessor,
        patternExtractor,
        repository,
        graphRepository,
      );
      if (embeddingProvider) {
        const note = repository.getNoteById(noteId);
        if (note) {
          const embedding = await embeddingProvider.embed(note.content);
          repository.saveEmbedding(noteId, embedding, config.embedding.modelName);
        }
      }
      console.error(`Indexed: ${filePath}`);
    } catch (error) {
      console.error(`Error indexing ${filePath}:`, error instanceof Error ? error.message : error);
    }
  });

  watcher.on("change", async (filePath: string) => {
    try {
      const noteId = await indexFile(
        filePath,
        rootPath,
        fileProcessor,
        patternExtractor,
        repository,
        graphRepository,
      );
      if (embeddingProvider) {
        const note = repository.getNoteById(noteId);
        if (note) {
          const embedding = await embeddingProvider.embed(note.content);
          repository.saveEmbedding(noteId, embedding, config.embedding.modelName);
        }
      }
      console.error(`Re-indexed: ${filePath}`);
    } catch (error) {
      console.error(
        `Error re-indexing ${filePath}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  watcher.on("unlink", (filePath: string) => {
    try {
      repository.deleteNoteByPath(filePath);
      console.error(`Removed: ${filePath}`);
    } catch (error) {
      console.error(`Error removing ${filePath}:`, error instanceof Error ? error.message : error);
    }
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.error("Shutting down...");
    if (embeddingProvider) {
      await embeddingProvider.close();
    }
    await watcher.close();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
