// Worked example: how to wire @knowledgine/core into a MemoryProvider.
//
// This is intentionally a thin facade — the production-grade implementation
// lives in `@knowledgine/mcp-server` as `KnowledgineMemoryProvider`. The
// example exists to show external implementers how the pieces fit together
// without forcing them to read the full mcp-server module.
//
// Run a fresh provider per test in `runConformanceSuite({ createProvider })`
// to get isolated SQLite databases.

import {
  ALL_MIGRATIONS,
  MemoryManager,
  Migrator,
  createDatabase,
  closeDatabase,
} from "@knowledgine/core";
import type { MemoryProvider } from "@knowledgine/mcp-memory-protocol";
import { KnowledgineMemoryProvider } from "@knowledgine/mcp-server";

export interface CreatedKnowledgineProvider {
  provider: MemoryProvider;
  /** Close the underlying SQLite handle. Pass into runConformanceSuite's `teardown`. */
  close: () => void;
}

/**
 * Build a MemoryProvider backed by a fresh in-memory SQLite database.
 *
 *   ```ts
 *   import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
 *   import { createKnowledgineProvider } from "./src/index.js";
 *
 *   runConformanceSuite({
 *     createProvider: () => createKnowledgineProvider(),
 *     teardown: (p) => (p as { __close?: () => void }).__close?.(),
 *   });
 *   ```
 *
 * `createProvider` returns the provider directly; the close handle is
 * stashed on the instance via `__close` so the suite's `teardown` can find
 * it without changing the public `MemoryProvider` shape.
 */
export function createKnowledgineProvider(): MemoryProvider {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const memoryManager = new MemoryManager(db);
  const provider = new KnowledgineMemoryProvider(memoryManager, db);
  Object.defineProperty(provider, "__close", {
    value: () => closeDatabase(db),
    enumerable: false,
    configurable: true,
  });
  return provider as MemoryProvider;
}

/**
 * Convenience helper if you'd rather pass an explicit close callback rather
 * than reading `__close` off the instance.
 */
export function createKnowledgineProviderWithClose(): CreatedKnowledgineProvider {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const memoryManager = new MemoryManager(db);
  const provider = new KnowledgineMemoryProvider(memoryManager, db);
  return {
    provider,
    close: () => closeDatabase(db),
  };
}
