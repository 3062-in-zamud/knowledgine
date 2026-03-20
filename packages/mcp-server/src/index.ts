#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveConfig, initializeDependencies } from "./helpers.js";
import { createKnowledgineMcpServer } from "./server.js";

export { createKnowledgineMcpServer } from "./server.js";
export {
  resolveConfig,
  initializeDependencies,
  formatToolResult,
  formatToolError,
} from "./helpers.js";
export { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main(): Promise<void> {
  const config = resolveConfig();
  const { repository, embeddingProvider, graphRepository } = initializeDependencies(config);
  const server = createKnowledgineMcpServer(repository, config.rootPath, embeddingProvider, graphRepository);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run main if this is the entry point (not imported)
const isEntryPoint =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isEntryPoint) {
  main().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  });
}
