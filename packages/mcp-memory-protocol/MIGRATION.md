# Migration Guide — `@knowledgine/mcp-memory-protocol`

## v0.3.x → v0.4.0 (upcoming)

### TL;DR

- The conformance test kit is now **`MemoryProvider`-based** instead of MCP-Client-based.
- It lives at `@knowledgine/mcp-memory-protocol/conformance` (a new subpath export).
- The kit registers vitest `describe`/`it` blocks, so it must be invoked from a vitest spec file.
- The main entry (`@knowledgine/mcp-memory-protocol`) no longer re-exports conformance helpers — keep the production import surface lean.
- `RecalledMemory` gains the spec §6.1 fields `deprecated`, `deprecationReason`, `supersedes`, and `validFrom`. Existing providers that build their own response objects must populate these.

### Why

The previous harness wrapped an MCP `Client` in `ConformanceTestContext` and pushed assertions through every test. To validate compliance, an external provider had to spin up an MCP server and a transport pair just to call `store_memory` once. By dropping to the `MemoryProvider` interface, providers can run the full suite inline in their own test process — no MCP server required — and per-test isolation comes from a `createProvider()` factory called in `beforeEach`.

The shape change is mechanical, but it is breaking. We intentionally chose a clean break (no deprecated re-exports) because v0.3.x has no documented external consumers and the new API is significantly more ergonomic.

### Before

```ts
// my-provider.spec.ts (old)
import { describe, it, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol";

describe("my provider conformance", () => {
  let client: Client;

  beforeEach(async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await myServer.connect(b);
    client = new Client({ name: "spec", version: "0.0.0" });
    await client.connect(a);
  });

  afterEach(() => myServer.close());

  it("passes the conformance suite", async () => {
    const results = await runConformanceSuite({ client }, { includeVersioning: true });
    const failures = results.filter((r) => !r.passed);
    if (failures.length) throw new Error(failures.map((f) => f.name).join("\n"));
  });
});
```

### After

```ts
// my-provider.conformance.test.ts (new)
import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
import { MyProvider } from "./my-provider.js";

runConformanceSuite({
  createProvider: () => new MyProvider(),
  // teardown: (p) => p.close(),
  // skip: ["versioning"],
});
```

That single call registers `describe(...)` blocks for every required and capability suite. There is no longer a manual results array — failures show up directly in vitest's reporter.

### Step-by-step

1. **Update your import path.**

   ```diff
   -import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol";
   +import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
   ```

2. **Replace the call site.** Drop the surrounding `describe` / `beforeEach` / `it` boilerplate that wired an MCP `Client`. Pass `createProvider` directly:

   ```diff
   -const results = await runConformanceSuite({ client }, { includeVersioning: true });
   +runConformanceSuite({ createProvider: () => new MyProvider() });
   ```

   The new API is **synchronous** — it just registers blocks. The actual assertions run when vitest executes the file.

3. **Remove `ConformanceTestContext` / `ConformanceResult` imports.** They no longer exist.

4. **Replace `includeVersioning` / `includeCapabilities` flags** with capability declarations on your provider:

   ```diff
   -await runConformanceSuite({ client }, { includeVersioning: true });
   +// Versioning runs automatically because provider.capabilities().versioning === true.
   ```

   To explicitly skip a capability your provider declares, use the new `skip` option:

   ```ts
   runConformanceSuite({ createProvider, skip: ["versioning"] });
   ```

5. **Populate the new `RecalledMemory` fields.** If your provider builds response objects by hand, add:
   - `deprecated: boolean` — true after `forget(soft)` or `update(createVersion: true)` on this row
   - `deprecationReason?: string` — the `reason` provided to `forget` or "superseded by new version"
   - `supersedes?: string` — id of the previous version (versioning capability only)
   - `validFrom: string` — when this version became valid; for v1 this is `createdAt`

### Using Jest instead of vitest

The kit uses `describe`, `it`, `beforeEach`, `afterEach`, and `ctx.skip()`. Jest exposes all of these. Wire it up with:

```ts
// jest.setup.ts
import { describe, it, beforeEach, afterEach } from "@jest/globals";

(globalThis as any).describe = describe;
(globalThis as any).it = it;
(globalThis as any).beforeEach = beforeEach;
(globalThis as any).afterEach = afterEach;
```

The fake-skip semantics differ: vitest's `ctx.skip()` becomes Jest's `it.skip()`. The kit calls `ctx.skip()` from `beforeEach`, which Jest 28+ supports via the test context argument. If you are stuck on an older Jest, the simplest workaround is to **opt out** of optional suites with `skip: ["versioning", "temporalQuery", "ttl"]` and run only the required suites.

### Shape changes summary

| Symbol                               | v0.3.x                                         | v0.4.0                                         |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| Conformance entry point              | `@knowledgine/mcp-memory-protocol`             | `@knowledgine/mcp-memory-protocol/conformance` |
| `runConformanceSuite` signature      | `(ctx, options): Promise<ConformanceResult[]>` | `({ createProvider, teardown?, skip? }): void` |
| `ConformanceTestContext`             | exported                                       | removed                                        |
| `ConformanceResult`                  | exported                                       | removed (vitest reporters own pass/fail)       |
| `runStoreTests` / `runRecallTests` … | exported individually                          | private internal helpers                       |
| `RecalledMemory.deprecated`          | absent                                         | required boolean                               |
| `RecalledMemory.validFrom`           | absent                                         | required string                                |
| `RecalledMemory.deprecationReason`   | absent                                         | optional string                                |
| `RecalledMemory.supersedes`          | absent                                         | optional string                                |

If you implemented the prior API and are not yet ready to migrate, pin `@knowledgine/mcp-memory-protocol@0.3.1` until your provider is rewritten.
