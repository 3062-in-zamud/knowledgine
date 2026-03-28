import {
  loadConfig,
  loadSqliteVecExtension,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  GraphRepository,
  FeedbackRepository,
  ALL_MIGRATIONS,
  OnnxEmbeddingProvider,
  ModelManager,
} from "@knowledgine/core";
import type { KnowledgineConfig, EmbeddingProvider } from "@knowledgine/core";

export function resolveConfig(): KnowledgineConfig {
  const dbPath = process.env["KNOWLEDGINE_DB_PATH"];
  const rootPath = process.env["KNOWLEDGINE_ROOT_PATH"] ?? process.cwd();
  const config = loadConfig(rootPath);

  // Override dbPath from env if set
  if (dbPath) {
    config.dbPath = dbPath;
  }

  // Model auto-detection for backward compatibility:
  // If semantic is not explicitly enabled, check if model is already downloaded
  if (!config.embedding.enabled) {
    const modelManager = new ModelManager();
    if (modelManager.isModelAvailable(config.embedding.modelName)) {
      config.embedding.enabled = true;
      console.error("[knowledgine] Semantic search enabled (model detected)");
    } else {
      console.error(
        "[knowledgine] Semantic search disabled (no model). Set KNOWLEDGINE_SEMANTIC=true or run 'knowledgine upgrade --semantic'",
      );
    }
  } else {
    console.error("[knowledgine] Semantic search enabled (configured)");
  }

  return config;
}

export async function initializeDependencies(config: KnowledgineConfig): Promise<{
  repository: KnowledgeRepository;
  embeddingProvider: EmbeddingProvider | undefined;
  graphRepository: GraphRepository;
  feedbackRepository: FeedbackRepository;
  db: import("better-sqlite3").Database;
}> {
  // 1. Create database without sqlite-vec (loaded async below if needed)
  const db = createDatabase(config.dbPath);

  // 2. Load sqlite-vec if semantic search is enabled
  if (config.embedding.enabled) {
    await loadSqliteVecExtension(db);
  }

  // 3. Run migrations
  new Migrator(db, ALL_MIGRATIONS).migrate();

  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);
  const feedbackRepository = new FeedbackRepository(db);

  // 4. EmbeddingProvider initialization (only if model exists)
  let embeddingProvider: EmbeddingProvider | undefined;
  if (config.embedding?.enabled) {
    const modelManager = new ModelManager();
    if (modelManager.isModelAvailable(config.embedding.modelName)) {
      embeddingProvider = new OnnxEmbeddingProvider(config.embedding.modelName, modelManager);
    } else {
      console.error(
        `[knowledgine] Embedding model "${config.embedding.modelName}" not found. ` +
          "Semantic search will be unavailable. Run: knowledgine upgrade --semantic",
      );
    }
  }

  return { repository, embeddingProvider, graphRepository, feedbackRepository, db };
}

export function formatToolResult(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

export function formatToolError(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
