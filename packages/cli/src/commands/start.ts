import { resolve } from "path";
import { mkdirSync } from "fs";
import { watch } from "chokidar";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  loadSqliteVecExtension,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  FeedbackRepository,
  FileProcessor,
  PatternExtractor,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
  DEFAULT_MODEL_NAME,
  checkSemanticReadiness,
  buildEmbeddingInput,
} from "@knowledgine/core";
import { createKnowledgineMcpServer, StdioServerTransport } from "@knowledgine/mcp-server";
import { indexFile } from "../lib/indexer.js";
import { createBox, colors, symbols } from "../lib/ui/index.js";

export interface StartOptions {
  path?: string;
  ingest?: boolean;
  watch?: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);

  // Ensure .knowledgine directory exists
  mkdirSync(resolve(rootPath, ".knowledgine"), { recursive: true });

  // Load config (respects .knowledginerc.json and env vars)
  const config = loadConfig(rootPath);

  // Auto-detect model for backward compatibility (without mutating config)
  const modelManager = new ModelManager();
  const autoDetected =
    !config.embedding.enabled && modelManager.isModelAvailable(config.embedding.modelName);
  if (autoDetected) {
    console.error(
      `${symbols.success} ${colors.success("Semantic search enabled (model detected)")}`,
    );
  }

  // Initialize database
  const db = createDatabase(config.dbPath);

  // Load sqlite-vec if semantic search is enabled (or auto-detected)
  if (config.embedding.enabled || autoDetected) {
    await loadSqliteVecExtension(db);
  }

  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);
  const feedbackRepository = new FeedbackRepository(db);

  // Warn if no notes indexed (H-8)
  const stats = repository.getStats();
  if (stats.totalNotes === 0) {
    console.error(
      `${symbols.warning} ${colors.warning("No notes indexed. Run `knowledgine init` first.")}`,
    );
  }

  // Initialize embedding provider based on semantic readiness
  // Use effective config that accounts for auto-detection (without mutating original config)
  const effectiveConfig = autoDetected
    ? { ...config, embedding: { ...config.embedding, enabled: true } }
    : config;
  let embeddingProvider: OnnxEmbeddingProvider | undefined;
  const semanticReadiness = checkSemanticReadiness(effectiveConfig, modelManager, repository);
  if (semanticReadiness.ready) {
    embeddingProvider = new OnnxEmbeddingProvider(DEFAULT_MODEL_NAME, modelManager);
    // ONNX セッションをウォームアップして初回 semantic 検索のレイテンシスパイクを防止
    embeddingProvider.embed("warmup").catch(() => {
      // ウォームアップ失敗は無視（MCP 起動を妨げない）
    });
  } else if (semanticReadiness.configEnabled) {
    if (!semanticReadiness.modelAvailable) {
      // Config enabled but model not downloaded
      const notesWithoutCount = repository.getNotesWithoutEmbeddingIds().length;
      if (notesWithoutCount > 0) {
        console.error(
          `${symbols.warning} ${colors.warning(
            `${notesWithoutCount} notes have no embeddings. ` +
              "Semantic search unavailable. Run 'knowledgine upgrade --semantic' to download the model and generate embeddings.",
          )}`,
        );
      }
    } else if (semanticReadiness.embeddingsCount === 0 && semanticReadiness.totalNotes > 0) {
      // Model available but embeddings not yet generated
      const notesWithoutCount = repository.getNotesWithoutEmbeddingIds().length;
      console.error(
        `${symbols.warning} ${colors.warning(
          `${notesWithoutCount} notes have no embeddings. ` +
            "Semantic search unavailable. Run 'knowledgine upgrade --semantic' to download the model and generate embeddings.",
        )}`,
      );
    }
  } else {
    console.error(`${symbols.info} ${colors.info("Running with FTS5 full-text search only")}`);
  }

  // Start MCP server via stdio
  const server = createKnowledgineMcpServer({
    repository,
    rootPath,
    embeddingProvider,
    graphRepository,
    feedbackRepository,
    db,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const searchMode = semanticReadiness.ready ? "semantic + FTS5" : "FTS5 full-text search";
  console.error(
    createBox(
      [
        `${symbols.info} Path:   ${rootPath}`,
        `${symbols.info} Notes:  ${stats.totalNotes} indexed`,
        `${symbols.info} Search: ${searchMode}`,
      ].join("\n"),
      { title: "knowledgine MCP Server", type: "info" },
    ),
  );
  console.error(colors.success("MCP server started on stdio"));

  // IngestEngine integration (only when --ingest flag is set)
  let ingestWatcher: import("../lib/ingest-watcher.js").IngestWatcher | undefined;
  let ingestRegistry: import("@knowledgine/ingest").PluginRegistry | undefined;

  if (options.ingest) {
    const { createDefaultRegistry, initializePlugins } = await import("../lib/plugin-loader.js");
    const { IngestEngine } = await import("@knowledgine/ingest");
    const { IngestWatcher } = await import("../lib/ingest-watcher.js");

    ingestRegistry = createDefaultRegistry();
    const initResults = await initializePlugins(ingestRegistry);

    // Warn about failed plugins but continue
    for (const [pluginId, result] of initResults) {
      if (!result.ok) {
        console.error(
          `${symbols.warning} ${colors.warning(`Plugin "${pluginId}" failed to initialize: ${result.error}`)}`,
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
          `${symbols.success} ${colors.success(`Ingest complete: ${total} events processed, ${errors} errors`)}`,
        );
      },
      onError: (pluginId, error) => {
        console.error(
          `${symbols.error} ${colors.error(`Ingest error (${pluginId}): ${error.message}`)}`,
        );
      },
    });

    // Run initial ingest in background (don't block MCP responses)
    ingestWatcher.runInitialIngest().catch((error) => {
      console.error(
        `${symbols.error} ${colors.error(`Initial ingest failed: ${error instanceof Error ? error.message : String(error)}`)}`,
      );
    });

    console.error(`${symbols.info} ${colors.info("IngestEngine started (background ingestion)")}`);
  }

  // File watcher for auto-reindexing
  const fileProcessor = new FileProcessor();
  const patternExtractor = new PatternExtractor();

  let watcher: ReturnType<typeof watch> | undefined;
  if (options.watch !== false) {
    watcher = watch("**/*.md", {
      cwd: rootPath,
      ignored: [/node_modules/, /\.knowledgine/, /\.git/, /dist/],
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on("error", (err: unknown) => {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "EMFILE" || nodeErr.code === "ENOSPC") {
        console.error(
          `${symbols.error} ${colors.error("File watcher limit reached. Use --no-watch to disable.")}`,
        );
        console.error(`  Or increase the limit: ulimit -n 4096`);
        // Gracefully close the watcher to prevent further EMFILE cascading
        watcher?.close().catch(() => {});
        watcher = undefined;
        console.error(
          `${symbols.info} ${colors.info("File watcher stopped. MCP server continues without auto-reindexing.")}`,
        );
      } else {
        console.error(
          `${symbols.error} ${colors.error(`File watcher error: ${nodeErr.message ?? String(err)}`)}`,
        );
      }
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
            const embedding = await embeddingProvider.embed(buildEmbeddingInput(note));
            repository.saveEmbedding(noteId, embedding, config.embedding.modelName);
          }
        }
        console.error(`${symbols.arrow} ${colors.info(`Indexed: ${filePath}`)}`);
      } catch (error) {
        console.error(
          `${symbols.error} ${colors.error(`Error indexing ${filePath}: ${error instanceof Error ? error.message : error}`)}`,
        );
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
            const embedding = await embeddingProvider.embed(buildEmbeddingInput(note));
            repository.saveEmbedding(noteId, embedding, config.embedding.modelName);
          }
        }
        console.error(`${symbols.arrow} ${colors.info(`Re-indexed: ${filePath}`)}`);
      } catch (error) {
        console.error(
          `${symbols.error} ${colors.error(`Error re-indexing ${filePath}: ${error instanceof Error ? error.message : error}`)}`,
        );
      }
    });

    watcher.on("unlink", (filePath: string) => {
      try {
        repository.deleteNoteByPath(filePath);
        console.error(`${symbols.arrow} ${colors.info(`Removed: ${filePath}`)}`);
      } catch (error) {
        console.error(
          `${symbols.error} ${colors.error(`Error removing ${filePath}: ${error instanceof Error ? error.message : error}`)}`,
        );
      }
    });
  } else {
    console.error(`${symbols.info} ${colors.info("File watcher disabled (--no-watch)")}`);
  }

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
    if (watcher) {
      await watcher.close();
    }
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
