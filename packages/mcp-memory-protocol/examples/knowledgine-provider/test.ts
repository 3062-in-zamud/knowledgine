// Conformance run for the knowledgine-provider example.
// Drives the full required + versioning + temporal_query + ttl suites
// against a fresh in-memory SQLite-backed KnowledgineMemoryProvider.

import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
import { createKnowledgineProvider } from "./src/index.js";

interface ClosableProvider {
  __close?: () => void;
}

runConformanceSuite({
  createProvider: () => createKnowledgineProvider(),
  teardown: (p) => (p as ClosableProvider).__close?.(),
});
