// Conformance run for the minimal-provider example.
// Mirrors the in-tree fake-provider smoke test, but using the public package
// surface that an external consumer would see.

import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
import { MinimalInMemoryProvider } from "./src/index.js";

runConformanceSuite({
  createProvider: () => new MinimalInMemoryProvider(),
});
