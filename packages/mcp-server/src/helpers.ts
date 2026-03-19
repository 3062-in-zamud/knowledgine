import {
  defineConfig,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import type { KnowledgineConfig } from "@knowledgine/core";

export function resolveConfig(): KnowledgineConfig {
  const dbPath = process.env["KNOWLEDGINE_DB_PATH"];
  const rootPath = process.env["KNOWLEDGINE_ROOT_PATH"] ?? process.cwd();
  return defineConfig({
    rootPath,
    ...(dbPath ? { dbPath } : {}),
  });
}

export function initializeDependencies(config: KnowledgineConfig): KnowledgeRepository {
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  return new KnowledgeRepository(db);
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
