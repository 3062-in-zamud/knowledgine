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
import type { KnowledgineConfig, EmbeddingProvider } from "@knowledgine/core";

export function resolveConfig(): KnowledgineConfig {
  const dbPath = process.env["KNOWLEDGINE_DB_PATH"];
  const rootPath = process.env["KNOWLEDGINE_ROOT_PATH"] ?? process.cwd();
  return defineConfig({
    rootPath,
    ...(dbPath ? { dbPath } : {}),
  });
}

export function initializeDependencies(config: KnowledgineConfig): {
  repository: KnowledgeRepository;
  embeddingProvider: EmbeddingProvider | undefined;
  graphRepository: GraphRepository;
} {
  // 1. sqlite-vec のロードを含む DB 作成（createDatabase 内で try/catch）
  const db = createDatabase(config.dbPath, { enableVec: true });

  // 2. migrate（sqlite-vec ロード後に実行）
  new Migrator(db, ALL_MIGRATIONS).migrate();

  const repository = new KnowledgeRepository(db);
  const graphRepository = new GraphRepository(db);

  // 3. EmbeddingProvider 初期化（モデルが存在する場合のみ）
  let embeddingProvider: EmbeddingProvider | undefined;
  if (config.embedding.enabled) {
    const modelManager = new ModelManager();
    if (modelManager.isModelAvailable(config.embedding.modelName)) {
      embeddingProvider = new OnnxEmbeddingProvider(config.embedding.modelName, modelManager);
    } else {
      console.error(
        `[knowledgine] Embedding model "${config.embedding.modelName}" not found. ` +
          "Semantic search will be unavailable. Run: node scripts/download-model.js",
      );
    }
  }

  return { repository, embeddingProvider, graphRepository };
}

export function formatToolResult(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
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
