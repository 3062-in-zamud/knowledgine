# Conformance Test Suite

The `@knowledgine/mcp-memory-protocol` package ships a conformance test suite
that any MCP memory server implementation can run to verify compliance with
this specification.

## What the suite tests

### Required (MUST) — all implementations

| Test                              | Description                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `store_memory: basic`             | Stores an entry and verifies the returned ID, layer, version=1, createdAt.                  |
| `store_memory: default layer`     | Omitting `layer` stores in `episodic`.                                                      |
| `store_memory: INVALID_CONTENT`   | Empty `content` returns error code `INVALID_CONTENT`.                                       |
| `store_memory: INVALID_LAYER`     | Unknown `layer` value returns `INVALID_LAYER`.                                              |
| `recall_memory: basic`            | Retrieves a stored entry by query.                                                          |
| `recall_memory: empty query`      | Omitting `query` returns recent entries.                                                    |
| `recall_memory: filter by layer`  | `filter.layer` restricts results to the specified layer.                                    |
| `recall_memory: filter by tags`   | `filter.tags` applies AND semantics.                                                        |
| `recall_memory: limit`            | Result count does not exceed `limit`; `hasMore` is set correctly.                           |
| `recall_memory: accessCount`      | `accessCount` increments after each recall.                                                 |
| `update_memory: in-place`         | `createVersion: false` updates content in place; ID is unchanged.                           |
| `update_memory: MEMORY_NOT_FOUND` | Non-existent ID returns `MEMORY_NOT_FOUND`.                                                 |
| `forget_memory: soft`             | Soft delete sets `deprecated: true`; entry survives.                                        |
| `forget_memory: MEMORY_NOT_FOUND` | Non-existent ID returns `MEMORY_NOT_FOUND`.                                                 |
| `error format`                    | Error responses follow `{ isError: true, content: [{ type: "text", text: "CODE: ..." }] }`. |

### Optional — `versioning` capability

| Test                                   | Description                                                               |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `update_memory: createVersion=true`    | Creates new entry; old entry is deprecated; `supersedes` links correctly. |
| `update_memory: version increment`     | New entry has `version = old.version + 1`.                                |
| `update_memory: atomicity`             | Both INSERT and UPDATE complete or neither does (no partial state).       |
| `recall_memory: includeVersionHistory` | Deprecated versions are included when flag is `true`.                     |

### Optional — `temporal_query` capability

| Test                                | Description                                  |
| ----------------------------------- | -------------------------------------------- |
| `recall_memory: asOf before update` | Returns the version active before an update. |
| `recall_memory: asOf after update`  | Returns the version active after an update.  |
| `recall_memory: asOf boundary`      | `validFrom == asOf` is included.             |

### Optional — `semantic_search` capability

| Test                                    | Description                                        |
| --------------------------------------- | -------------------------------------------------- |
| `recall_memory: relevanceScore present` | `relevanceScore` (0.0–1.0) is included in results. |
| `recall_memory: semantic ranking`       | Higher relevance entries are ranked first.         |

### Optional — `ttl` capability

| Test                            | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `store_memory: ttl`             | Entry becomes unavailable after TTL seconds. |
| `store_memory: ttl not expired` | Entry is available before TTL expires.       |

---

## Running the suite against your implementation

### Prerequisites

```bash
node >= 18
npm >= 9
```

### Install

```bash
npm install --save-dev @knowledgine/mcp-memory-protocol
```

### Write an adapter

The conformance suite communicates with your server through a simple adapter
interface:

```typescript
import type { ConformanceAdapter } from "@knowledgine/mcp-memory-protocol/conformance";

const adapter: ConformanceAdapter = {
  async callTool(name: string, input: unknown): Promise<unknown> {
    // Call your MCP server's tools/call endpoint and return the result.
    // For an in-process server, call the handler directly.
    // For a remote server, use the MCP client SDK.
    return myMcpClient.callTool(name, input);
  },
};
```

### Run

```typescript
import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";

const results = await runConformanceSuite(adapter, {
  // Declare which optional capabilities your server supports.
  // Only tests for declared capabilities are run.
  capabilities: ["versioning", "temporal_query"],
});

console.log(results.summary());
// Passed: 28/28 (required: 15/15, versioning: 8/8, temporal_query: 5/5)
```

### Exit code

`runConformanceSuite` resolves normally even when tests fail, so you can
inspect results programmatically. To fail a CI build on any test failure:

```typescript
if (!results.passed) {
  process.exit(1);
}
```

---

## Example: running against the reference implementation

```bash
# Clone Knowledgine
git clone https://github.com/3062-in-zamud/knowledgine
cd knowledgine

# Install dependencies
npm install

# Run the conformance suite against the reference server
npm run conformance --workspace packages/mcp-memory-protocol
```

Expected output:

```
Running MCP Memory Protocol Conformance Suite
=============================================
Required tests ............... 15/15 PASS
versioning ................... 8/8 PASS
temporal_query ............... 5/5 PASS
semantic_search .............. 3/3 PASS
layer_promotion .............. 2/2 PASS
ttl .......................... 2/2 PASS
---------------------------------------------
Total: 35/35 PASS
```
