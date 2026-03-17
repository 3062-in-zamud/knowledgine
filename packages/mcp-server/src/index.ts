import type { KnowledgineConfig } from "@knowledgine/core";

export interface McpServer {
  name: string;
  config: KnowledgineConfig;
}

export function createServer(config: KnowledgineConfig): McpServer {
  return {
    name: `knowledgine:${config.basePath}`,
    config,
  };
}
