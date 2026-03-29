# Implementation Guide

This guide explains how to implement the MCP Memory Protocol using the
`@knowledgine/mcp-memory-protocol` package.

## Overview

To build an MCP memory server you need to:

1. Implement the `MemoryProvider` interface
2. Register the four core tools (plus `get_memory_capabilities`) with the MCP server
3. Validate with the conformance suite

---

## 1. Implement MemoryProvider

```typescript
import type {
  MemoryProvider,
  MemoryStoreRequest,
  MemoryStoreResponse,
  MemoryRecallRequest,
  MemoryRecallResponse,
  MemoryForgetRequest,
  MemoryForgetResponse,
  MemoryProviderCapabilities,
} from "@knowledgine/mcp-memory-protocol";
import { invalidContent, invalidLayer, memoryNotFound } from "@knowledgine/mcp-memory-protocol";

export class MyMemoryProvider implements MemoryProvider {
  async store(req: MemoryStoreRequest): Promise<MemoryStoreResponse> {
    if (!req.content) throw invalidContent();
    const validLayers = ["episodic", "semantic", "procedural"];
    if (req.layer && !validLayers.includes(req.layer)) throw invalidLayer(req.layer);

    const layer = req.layer ?? "episodic";
    // ... persist to storage ...
    return { id: "mem_...", layer, version: 1, createdAt: new Date().toISOString() };
  }

  async recall(req: MemoryRecallRequest): Promise<MemoryRecallResponse> {
    // ... query storage ...
    return { memories: [], totalCount: 0, hasMore: false };
  }

  async update(req) {
    // see MemoryUpdateRequest / MemoryUpdateResponse in types.ts
    if (!(/* exists */ false)) throw memoryNotFound(req.id);
    // ...
  }

  async forget(req: MemoryForgetRequest) {
    if (!(/* exists */ false)) throw memoryNotFound(req.id);
    // soft delete by default
    return { id: req.id, forgotten: true, method: req.hard ? "hard" : "soft" } as const;
  }

  capabilities(): MemoryProviderCapabilities {
    return {
      versioning: true,
      semanticSearch: false,
      layerPromotion: true,
      temporalQuery: false,
      ttl: false,
      supportedLayers: ["episodic", "semantic", "procedural"],
    };
  }
}
```

---

## 2. Register Tools with Zod Schemas

Use the exported Zod schemas for input validation and MCP tool registration:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MemoryStoreRequestSchema,
  MemoryRecallRequestSchema,
  MemoryForgetRequestSchema,
  MemoryProtocolError,
} from "@knowledgine/mcp-memory-protocol";
import type { MemoryProvider } from "@knowledgine/mcp-memory-protocol";

function formatError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { isError: true as const, content: [{ type: "text" as const, text: msg }] };
}

export function registerMemoryTools(server: McpServer, provider: MemoryProvider): void {
  server.registerTool(
    "store_memory",
    { description: "Store a memory entry", inputSchema: { content: z.string() /* ... */ } },
    async (input) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(await provider.store(input)) }] };
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ... recall_memory, update_memory, forget_memory follow the same pattern ...

  server.registerTool(
    "get_memory_capabilities",
    { description: "Get memory provider capabilities", inputSchema: {} },
    async () => {
      const caps = provider.capabilities();
      return { content: [{ type: "text" as const, text: JSON.stringify(caps, null, 2) }] };
    },
  );
}
```

---

## 3. Error Handling

All errors MUST be returned as MCP tool errors in the format:

```json
{ "isError": true, "content": [{ "type": "text", "text": "MEMORY_NOT_FOUND: ..." }] }
```

Use the factory functions exported from `@knowledgine/mcp-memory-protocol`:

| Factory                           | Error Code                 | When to use                          |
| --------------------------------- | -------------------------- | ------------------------------------ |
| `invalidContent()`                | `INVALID_CONTENT`          | `content` is empty or missing        |
| `invalidLayer(val)`               | `INVALID_LAYER`            | `layer` is not a valid enum value    |
| `memoryNotFound(id)`              | `MEMORY_NOT_FOUND`         | ID does not exist in storage         |
| `invalidParameter(field, detail)` | `INVALID_PARAMETER`        | Any other input validation failure   |
| `storageError()`                  | `STORAGE_ERROR`            | Underlying storage failure           |
| `capabilityNotSupported()`        | `CAPABILITY_NOT_SUPPORTED` | Client uses an unimplemented feature |

Catch `MemoryProtocolError` and re-format it as a tool error rather than
letting it propagate as an unhandled exception.

---

## 4. Run the Conformance Suite

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol";

// Start your server and connect a client
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await myServer.connect(serverTransport);

const client = new Client({ name: "conformance", version: "1.0.0" });
await client.connect(clientTransport);

const results = await runConformanceSuite(
  { client },
  {
    includeVersioning: true, // only if your server supports versioning
    includeCapabilities: true, // run get_memory_capabilities tests
  },
);

const passed = results.filter((r) => r.passed).length;
console.log(`${passed}/${results.length} tests passed`);

if (results.some((r) => !r.passed)) {
  for (const r of results.filter((r) => !r.passed)) {
    console.error(`FAIL: ${r.name} — ${r.error}`);
  }
  process.exit(1);
}
```

---

## 5. Advanced: Versioning and Layer Promotion

> These features are covered in a separate advanced section and are **not**
> required for a conformant basic implementation. Focus on `store`, `recall`,
> and `forget` first.

- **Versioning**: `update_memory` with `createVersion: true` (default) creates
  a new entry and deprecates the old one. The new entry's `supersedes` field
  references the old ID.
- **Layer promotion**: Moving an entry from `episodic` to `semantic` or
  `procedural` can be modelled as a versioned update with a different `layer`.

Both are optional capabilities reported via `get_memory_capabilities`.
