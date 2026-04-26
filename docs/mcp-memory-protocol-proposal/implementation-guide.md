# Implementation Guide

This guide walks you through building a compliant **MCP Memory Protocol**
implementation using `@knowledgine/mcp-memory-protocol`. Knowledgine itself
is the reference implementation and ships in
`packages/mcp-server/src/memory-adapter.ts` (`KnowledgineMemoryProvider`),
which you can inspect for a complete worked example.

## Audience

You are building a memory backend for an MCP-aware agent platform — Mem0,
Zep, an internal vector DB, or a custom store. You want to:

- Match the protocol's wire shapes so any MCP client can talk to your server
- Verify spec compliance automatically as you iterate
- Pick up new capabilities (versioning, temporal_query, ttl) without
  re-implementing the protocol from scratch

## Prerequisites

- Node.js ≥ 20
- TypeScript (the package ships strict-mode types and Zod schemas)
- `vitest` ≥ 3 in dev dependencies if you want to run the conformance kit

## 1. Install the package

```bash
pnpm add @knowledgine/mcp-memory-protocol
pnpm add -D vitest
```

The `vitest` peer dependency is **optional** — only required when you
consume `@knowledgine/mcp-memory-protocol/conformance`.

## 2. Implement `MemoryProvider`

The provider contract is the entire surface area you have to fulfil:

```typescript
import type {
  MemoryProvider,
  MemoryStoreRequest,
  MemoryStoreResponse,
  MemoryRecallRequest,
  MemoryRecallResponse,
  MemoryUpdateRequest,
  MemoryUpdateResponse,
  MemoryForgetRequest,
  MemoryForgetResponse,
  MemoryProviderCapabilities,
} from "@knowledgine/mcp-memory-protocol";
import { invalidContent, invalidLayer, memoryNotFound } from "@knowledgine/mcp-memory-protocol";

export class MyProvider implements MemoryProvider {
  capabilities(): MemoryProviderCapabilities {
    return {
      versioning: false,
      semanticSearch: false,
      layerPromotion: false,
      temporalQuery: false,
      ttl: false,
      supportedLayers: ["episodic", "semantic", "procedural"],
    };
  }

  async store(req: MemoryStoreRequest): Promise<MemoryStoreResponse> {
    if (!req.content) throw invalidContent();
    const layer = req.layer ?? "episodic";
    if (!["episodic", "semantic", "procedural"].includes(layer)) {
      throw invalidLayer(layer);
    }
    /* persist… */
    return { id: "m_1", layer, version: 1, createdAt: new Date().toISOString() };
  }

  async recall(_req: MemoryRecallRequest): Promise<MemoryRecallResponse> {
    return { memories: [], totalCount: 0, hasMore: false };
  }

  async update(req: MemoryUpdateRequest): Promise<MemoryUpdateResponse> {
    throw memoryNotFound(req.id);
  }

  async forget(req: MemoryForgetRequest): Promise<MemoryForgetResponse> {
    throw memoryNotFound(req.id);
  }
}
```

### Required vs optional surface

The four required operations are the spec's §9.1 MUST set:

- `store_memory`
- `recall_memory` (without `asOf` or `includeVersionHistory`)
- `update_memory` (with `createVersion: false` only)
- `forget_memory` (with `hard: false` only)

Optional capabilities are advertised through `capabilities()`. The names below are the actual `MemoryProviderCapabilities` property keys (camelCase); the spec refers to them in snake_case (`temporal_query`, `semantic_search`, `layer_promotion`) — both forms refer to the same capability.

- **`versioning`** — `update_memory(createVersion: true)` creates a new
  immutable row, deprecating the old one. `recall_memory(includeVersionHistory:
true)` returns deprecated rows alongside live ones.
- **`temporalQuery`** (spec: `temporal_query`) — `recall_memory(asOf: "<ISO timestamp>")` returns
  the version of every chain that was current at that historical moment
  (spec §8.2). Soft-forgotten entries whose `deprecated_at > asOf` must be
  included.
- **`ttl`** — `store_memory({ttl})` schedules an entry for lazy-expire.
  Expired entries are filtered out of recall, and update/forget on an
  expired entry returns `MEMORY_NOT_FOUND`.
- **`semanticSearch`** (spec: `semantic_search`) — recall ranks results by embedding similarity
  (`relevanceScore` is populated).
- **`layerPromotion`** (spec: `layer_promotion`) — provider-internal automatic re-classification
  between layers.

You only have to implement the capabilities you declare `true`. The
conformance suite skips the corresponding tests for any capability you
declare `false`.

### Response shape essentials

`RecalledMemory` (spec §6.1) requires the following fields:

```ts
interface RecalledMemory {
  id: string;
  content: string;
  layer: MemoryLayer;
  version: number;
  accessCount: number;
  tags: string[];
  createdAt: string;
  validFrom: string; // when this version became valid; equals createdAt for v1
  deprecated: boolean; // true after forget(soft) or being superseded
  // Optional / capability-gated:
  summary?: string;
  metadata?: MemoryMetadata;
  updatedAt?: string;
  lastAccessedAt?: string;
  deprecationReason?: string; // when deprecated=true
  supersedes?: string; // versioning: id of previous version
  relevanceScore?: number; // semantic_search: similarity score
}
```

If your provider builds responses by hand, populate every required field;
otherwise the conformance suite will fail with a clear assertion.

## 3. Register MCP tools (optional — if you also expose an MCP server)

If your provider sits behind an MCP server, wire each operation to a tool
handler. Use the exported Zod schemas to validate inputs and the error
factories to surface protocol errors:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MemoryStoreRequestSchema,
  MemoryRecallRequestSchema,
  MemoryUpdateRequestSchema,
  MemoryForgetRequestSchema,
  MemoryProtocolError,
} from "@knowledgine/mcp-memory-protocol";
import type { MemoryProvider } from "@knowledgine/mcp-memory-protocol";

function formatError(err: unknown) {
  if (err instanceof MemoryProtocolError) {
    return {
      isError: true as const,
      content: [{ type: "text" as const, text: `${err.code}: ${err.message}` }],
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { isError: true as const, content: [{ type: "text" as const, text: msg }] };
}

export function registerMemoryTools(server: McpServer, provider: MemoryProvider): void {
  server.registerTool(
    "store_memory",
    { description: "Store a memory entry", inputSchema: MemoryStoreRequestSchema.shape },
    async (input) => {
      try {
        const result = await provider.store(MemoryStoreRequestSchema.parse(input));
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return formatError(err);
      }
    },
  );
  // … recall_memory, update_memory, forget_memory follow the same pattern …
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

The MCP server layer is optional. The conformance kit talks to your
`MemoryProvider` directly, so a pure backend (no MCP transport) can still
prove compliance.

## 4. Error handling contract (§7)

Every protocol error MUST be an instance of `MemoryProtocolError`. Use
the exported factories to keep codes consistent:

| Factory                           | Error code                 | When to throw                                   |
| --------------------------------- | -------------------------- | ----------------------------------------------- |
| `invalidContent()`                | `INVALID_CONTENT`          | `content` empty / missing                       |
| `invalidLayer(value)`             | `INVALID_LAYER`            | `layer` not in `MemoryLayer` enum               |
| `memoryNotFound(id)`              | `MEMORY_NOT_FOUND`         | id not in storage (or expired / hard-forgotten) |
| `invalidParameter(field, detail)` | `INVALID_PARAMETER`        | other validation failures                       |
| `versionConflict()`               | `VERSION_CONFLICT`         | optimistic concurrency violation                |
| `storageError()`                  | `STORAGE_ERROR`            | underlying storage failure                      |
| `capabilityNotSupported(name)`    | `CAPABILITY_NOT_SUPPORTED` | client requested an unimplemented capability    |

If your provider sits behind MCP tooling, catch `MemoryProtocolError` at
the tool boundary and re-format it as `{ isError: true, content: [{type: "text", text: \`${code}: ${message}\`}] }` — that is what the spec §7.2 wire format expects.

## 5. Run the conformance suite

Create a dedicated vitest spec file:

```ts
// my-provider.conformance.test.ts
import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
import { MyProvider } from "./my-provider.js";

runConformanceSuite({
  createProvider: () => new MyProvider(),
  // teardown: async (p) => { await p.close(); }, // close DB handles, etc.
  // skip: ["versioning"],                         // force-skip a capability
});
```

Then run:

```bash
pnpm vitest run my-provider.conformance.test.ts
```

`runConformanceSuite` registers vitest `describe`/`it` blocks. A single
spec file is enough to drive the full required suite plus every optional
capability your provider declares.

### What runs and when

| Suite                   | Type     | Gated by                                                 |
| ----------------------- | -------- | -------------------------------------------------------- |
| `store_memory (§5.1)`   | Required | always                                                   |
| `recall_memory (§5.2)`  | Required | always                                                   |
| `update_memory (§5.3)`  | Required | always                                                   |
| `forget_memory (§5.4)`  | Required | always                                                   |
| `error format (§7)`     | Required | always                                                   |
| `capabilities (§9.3)`   | Required | always                                                   |
| `versioning (§8)`       | Optional | `capabilities().versioning && !skip("versioning")`       |
| `temporal_query (§8.2)` | Optional | `capabilities().temporalQuery && !skip("temporalQuery")` |
| `ttl (§9.2)`            | Optional | `capabilities().ttl && !skip("ttl")`                     |

### Per-test isolation

`createProvider()` is called from each suite's `beforeEach`, so every
test gets a fresh instance. If your provider holds resources (DB
connections, file handles, network sockets), close them in `teardown`:

```ts
runConformanceSuite({
  createProvider: () => {
    const db = openDb(":memory:");
    runMigrations(db);
    return new MyProvider(db);
  },
  teardown: (provider) => {
    (provider as any).db.close();
  },
});
```

## 6. Reference: `KnowledgineMemoryProvider`

The knowledgine repo's `packages/mcp-server/src/memory-adapter.ts` is a
production-grade reference implementation backed by SQLite (better-sqlite3)
with the full optional capability set except `semantic_search`. Notable
details:

- §8.2 chain collapse uses an in-process Map<root_id, latest_row> rather
  than recursive SQL — simpler and faster on typical chain depths.
- TTL inheritance copies `expires_at` from the old row on
  `update(createVersion: true)`; explicit `ttl` overrides.
- Soft-forget always records `deleted_at` so the asOf rule
  `(deleted = 0 OR deleted_at > asOf)` never has to consider NULLs on
  deleted rows.

The full conformance test for the reference implementation lives at
`packages/mcp-server/tests/conformance-knowledgine.test.ts`.

## 7. Reference: minimal-provider walkthrough

Worked, runnable examples will be published at
`packages/mcp-memory-protocol/examples/`:

- **`minimal-provider/`** — ~50-line in-memory `MemoryProvider`
  implementation that passes the required suite plus `versioning`. Useful
  as a starting point for a new backend.
- **`knowledgine-provider/`** — thin adapter wiring the knowledgine core
  modules into a stand-alone `MemoryProvider`.

The examples are intentionally **not** shipped in the npm tarball
because they use `workspace:*` dependencies; clone the repo to run them.

## 8. Versioning your provider

When your provider's behaviour changes in a way that affects spec
compliance — adding a capability, changing how chain collapse works,
relaxing limits — bump your provider's own version. The protocol package
itself follows semver; if you pin a major version (`^0.3.0`, `^0.4.0`,
…) you'll get patch and minor protocol updates automatically.

## 9. Common pitfalls

- **Forgetting to populate `deprecated` and `validFrom`** on
  `RecalledMemory`. They are required by the conformance suite.
- **Treating `forget(soft)` as removal**. It only sets `deprecated = true`
  / `deleted_at`. The row is still recallable with
  `includeVersionHistory: true` and (if you support `temporal_query`) at
  asOf instants before the forget.
- **Returning `recall_memory` without `totalCount` / `hasMore`**. They
  are required even when no entries match (`totalCount: 0`,
  `hasMore: false`).
- **Skipping the `validFrom` field**. For v1 entries, `validFrom` equals
  `createdAt`; for versioned updates, it's the new row's `createdAt`.

## 10. Where to ask for help

Open an issue at
[`https://github.com/3062-in-zamud/knowledgine/issues`](https://github.com/3062-in-zamud/knowledgine/issues)
with the `mcp-memory-protocol` label. PRs against the spec or this guide
are welcome.
