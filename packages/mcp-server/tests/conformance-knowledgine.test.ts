// Conformance test for the KnowledgineMemoryProvider reference implementation.
// Drives the full required suite plus versioning / temporal_query / ttl
// optional suites against an in-memory SQLite-backed knowledgine stack.
//
// PR 3 unskips this file (PR 2 deleted the old MCP-Client-based test).

import { ALL_MIGRATIONS, MemoryManager, Migrator, createDatabase } from "@knowledgine/core";
import type { MemoryProvider } from "@knowledgine/mcp-memory-protocol";
import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
import { KnowledgineMemoryProvider } from "../src/memory-adapter.js";

interface ProviderHandle extends MemoryProvider {
  __dispose: () => void;
}

runConformanceSuite({
  createProvider: (): MemoryProvider => {
    const db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const memoryManager = new MemoryManager(db);
    const provider = new KnowledgineMemoryProvider(memoryManager, db);
    (provider as ProviderHandle).__dispose = () => db.close();
    return provider as MemoryProvider;
  },
  teardown: (provider: MemoryProvider): void => {
    (provider as ProviderHandle).__dispose?.();
  },
});
