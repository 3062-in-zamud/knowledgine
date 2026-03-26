# Reference Implementation Guide

The reference implementation lives in the
[Knowledgine repository](https://github.com/3062-in-zamud/knowledgine) and
consists of two packages.

## Packages

### `@knowledgine/mcp-memory-protocol`

TypeScript types, Zod validation schemas, and the conformance test suite.

```
packages/mcp-memory-protocol/
├── src/
│   ├── types.ts          # MemoryEntry, MemoryMetadata, RecallFilter, etc.
│   ├── schemas.ts        # Zod schemas for all operations
│   └── index.ts
└── conformance/
    └── suite.ts          # Conformance test suite
```

**Install:**

```bash
npm install @knowledgine/mcp-memory-protocol
```

**Use the types:**

```typescript
import type {
  MemoryEntry,
  StoreMemoryInput,
  RecallMemoryInput,
  UpdateMemoryInput,
  ForgetMemoryInput,
} from "@knowledgine/mcp-memory-protocol";
```

**Use the Zod schemas for input validation:**

```typescript
import { StoreMemoryInputSchema, RecallMemoryInputSchema } from "@knowledgine/mcp-memory-protocol";

const parsed = StoreMemoryInputSchema.safeParse(toolInput);
if (!parsed.success) {
  // return INVALID_PARAMETER error
}
```

---

### `@knowledgine/mcp-server`

MCP server implementing all four core operations plus optional capabilities.

**Supported capabilities:**

| Capability        | Status                                          |
| ----------------- | ----------------------------------------------- |
| Core operations   | Implemented                                     |
| `versioning`      | Implemented                                     |
| `temporal_query`  | Implemented                                     |
| `semantic_search` | Implemented (vector embeddings via local model) |
| `layer_promotion` | Implemented                                     |
| `ttl`             | Implemented                                     |

**Run the server:**

```bash
# Using npx
npx @knowledgine/mcp-server

# With a custom SQLite path
KNOWLEDGINE_DB_PATH=/path/to/memory.db npx @knowledgine/mcp-server
```

**Configure in Claude Code (`.claude/settings.json`):**

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@knowledgine/mcp-server"],
      "env": {
        "KNOWLEDGINE_DB_PATH": "/path/to/memory.db"
      }
    }
  }
}
```

---

## Example: store and recall

```typescript
// store_memory
const storeResult = await mcpClient.callTool("store_memory", {
  content: "Always run `npm run check:schema:ts` before committing schema changes.",
  layer: "procedural",
  tags: ["typescript", "workflow"],
  metadata: {
    source: "claude_code",
    project: "my-project",
  },
});
// → { id: "mem_01ABC", layer: "procedural", version: 1, createdAt: "..." }

// recall_memory
const recallResult = await mcpClient.callTool("recall_memory", {
  query: "schema validation before commit",
  limit: 5,
});
// → { memories: [...], totalCount: 1, hasMore: false }
```

## Example: version chain

```typescript
// update_memory (creates a new version by default)
const updateResult = await mcpClient.callTool("update_memory", {
  id: "mem_01ABC",
  content: "Always run `npm run check:schema:ts` and `npm run format` before committing.",
  createVersion: true,
});
// → { id: "mem_01DEF", version: 2, previousVersion: 1, updatedAt: "..." }

// recall with version history
const historyResult = await mcpClient.callTool("recall_memory", {
  filter: { memoryIds: ["mem_01DEF"] },
  includeVersionHistory: true,
});
// → includes both mem_01ABC (deprecated) and mem_01DEF (current)
```

## Example: point-in-time recall

```typescript
// What did we know about schema validation on 2026-01-01?
const pitResult = await mcpClient.callTool("recall_memory", {
  query: "schema validation",
  asOf: "2026-01-01T00:00:00Z",
});
```

---

## Architecture Notes

The reference implementation uses:

- **SQLite** (via `better-sqlite3`) as the default storage backend.
  The schema stores each version as a separate row, enabling efficient
  point-in-time queries.
- **SQLite FTS5** for full-text search when `semantic_search` capability is
  not configured.
- **Local embedding model** (optional) for vector similarity search when
  `semantic_search` is enabled.

The storage backend is abstracted behind a `MemoryRepository` interface,
allowing alternative backends (PostgreSQL, in-memory, etc.) without changing
the MCP tool layer.
