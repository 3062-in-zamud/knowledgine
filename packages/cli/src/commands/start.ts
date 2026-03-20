import { resolve } from "path";
import { mkdirSync } from "fs";
import { watch } from "chokidar";
import {
  loadConfig,
  createDatabase,
  loadSqliteVecExtension,
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
  ingest?: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const rootPath = resolve(options.path ?? process.cwd());

  // Ensure .knowledgine directory exists
  mkdirSync(resolve(rootPath, ".knowledgine"), { recursive: true });

  // Load config (respects .knowledginerc.json and env vars)
  const config = loadConfig(rootPath);

  // Auto-detect model for backward compatibility
  if (!config.embedding.enabled) {
    const modelManager = new ModelManager();
    if (modelManager.isModelAvailable(config.embedding.modelName)) {
      config.embedding.enabled = true;
      console.error("[knowledgine] Semantic search enabled (model detected)");
    }
  }

  // Initialize database
  const db = createDatabase(config.dbPath);

  // Load sqlite-vec if semantic search is enabled
  if (config.embedding.enabled) {
    await loadSqliteVecExtension(db);
  }

  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);

  // Warn if no notes indexed (H-8)
  const stats = repository.getStats();
  if (stats.totalNotes === 0) {
    console.error("Warning: No notes indexed. Run `knowledgine init` first.");
  }

  // Initialize embedding provider if model is available and semantic is enabled
  let embeddingProvider: OnnxEmbeddingProvider | undefined;
  if (config.embedding.enabled) {
    const modelManager = new ModelManager();
    if (modelManager.isModelAvailable()) {
      embeddingProvider = new OnnxEmbeddingProvider(undefined, modelManager);
    } else {
      // Warn if notes exist but no embeddings
      const notesWithout = repository.getNotesWithoutEmbeddings();
      if (notesWithout.length > 0) {
        console.error(
          `Warning: ${notesWithout.length} notes have no embeddings. ` +
            "Semantic search unavailable. Run 'knowledgine upgrade --semantic' to download the model and generate embeddings.",
        );
      }
    }
  } else {
    console.error("[knowledgine] Running with FTS5 full-text search only");
  }

  // Start MCP server via stdio
  const server = createKnowledgineMcpServer({
    repository,
    rootPath,
    embeddingProvider,
    graphRepository,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server started on stdio");

  // IngestEngine integration (only when --ingest flag is set)
  let ingestWatcher: import("../lib/ingest-watcher.js").IngestWatcher | undefined;
  let ingestRegistry: import("@knowledgine/ingest").PluginRegistry | undefined;

  if (options.ingest) {
    const { createDefaultRegistry, initializePlugins } = await import(
      "../lib/plugin-loader.js"
    );
    const { IngestEngine } = await import("@knowledgine/ingest");
    const { IngestWatcher } = await import("../lib/ingest-watcher.js");

    ingestRegistry = createDefaultRegistry();
    const initResults = await initializePlugins(ingestRegistry);

    // Warn about failed plugins but continue
    for (const [pluginId, result] of initResults) {
      if (!result.ok) {
        console.error(
          `Warning: Plugin "${pluginId}" failed to initialize: ${result.error}`,
        );
      }
    }

    const engine = new IngestEngine(ingestRegistry, db, repository);
    ingestWatcher = new IngestWatcher({
      engine,
      registry: ingestRegistry,
      rootPath,
      onComplete: (summaries) => {
        const total = summaries.reduce((acc, s) => acc + s.processed, 0);
        const errors = summaries.reduce((acc, s) => acc + s.errors, 0);
        console.error(
          `Ingest complete: ${total} events processed, ${errors} errors`,
        );
      },
      onError: (pluginId, error) => {
        console.error(`Ingest error (${pluginId}): ${error.message}`);
      },
    });

    // Run initial ingest in background (don't block MCP responses)
    ingestWatcher.runInitialIngest().catch((error) => {
      console.error(
        `Initial ingest failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    console.error("IngestEngine started (background ingestion)");
  }

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
    if (ingestWatcher) {
      await ingestWatcher.stop();
    }
    if (ingestRegistry) {
      await ingestRegistry.disposeAll();
    }
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
