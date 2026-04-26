# @knowledgine/mcp-memory-protocol

> Specification, types, and conformance test kit for **MCP Memory Protocol** — a long-term memory contract for AI memory providers (Mem0, Zep, knowledgine, …).

This package is the one-stop reference for the protocol:

- **Types & schemas** — TypeScript interfaces and Zod validators for every wire shape (§5 Operations, §6 Data Types, §7 Errors)
- **Provider interface** — the `MemoryProvider` contract every compliant implementation fulfils
- **Conformance test kit** — drop a factory in, get a vitest spec that validates §3-§11 against your provider
- **Reference implementation** — `@knowledgine/mcp-server` ships a `KnowledgineMemoryProvider` that satisfies the full kit

## Install

```bash
pnpm add @knowledgine/mcp-memory-protocol
# or: npm install @knowledgine/mcp-memory-protocol
```

If you plan to run the conformance kit, add `vitest` to your dev dependencies:

```bash
pnpm add -D vitest
```

## Quick start

### Implement a provider

```ts
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
import { invalidContent, memoryNotFound } from "@knowledgine/mcp-memory-protocol";

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
    /* persist… */
    return {
      id: "m_1",
      layer: req.layer ?? "episodic",
      version: 1,
      createdAt: new Date().toISOString(),
    };
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

### Run the conformance kit

```ts
// my-provider.conformance.test.ts
import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
import { MyProvider } from "./my-provider.js";

runConformanceSuite({
  createProvider: () => new MyProvider(),
  // teardown: (p) => p.close(),  // close DB handles, etc.
  // skip: ["versioning"],         // force-skip a capability you've declared true
});
```

Then `vitest run my-provider.conformance.test.ts`. The suite registers `describe`/`it` blocks for the four required operations, plus optional capability suites that self-gate on `provider.capabilities()`.

## What the kit checks

| Suite                   | Type     | Source                                                                   |
| ----------------------- | -------- | ------------------------------------------------------------------------ |
| `store_memory (§5.1)`   | Required | content/layer validation, INVALID_CONTENT, INVALID_LAYER                 |
| `recall_memory (§5.2)`  | Required | response shape, query, filter (layer/tags/dates/ids), limit, accessCount |
| `update_memory (§5.3)`  | Required | in-place update, MEMORY_NOT_FOUND                                        |
| `forget_memory (§5.4)`  | Required | soft / hard delete, MEMORY_NOT_FOUND                                     |
| `error format (§7)`     | Required | `MemoryProtocolError` propagation + codes                                |
| `capabilities (§9.3)`   | Required | shape of `provider.capabilities()` return value                          |
| `versioning (§8)`       | Optional | createVersion=true chain, deprecated exclusion                           |
| `temporal_query (§8.2)` | Optional | asOf with deprecated_at-based filtering, chain collapse                  |
| `ttl (§9.2)`            | Optional | lazy-expire on recall, MEMORY_NOT_FOUND on update/forget                 |

Optional suites only run when `provider.capabilities()` declares the matching capability (`versioning`, `temporalQuery`, `ttl`). To force-skip an opt-in capability you've declared true, pass `skip: ["versioning"]` etc.

## Test runner support

The conformance kit imports `describe`, `it`, `expect`, `beforeEach`, and `afterEach` directly from `vitest`, and uses the vitest-specific `ctx.skip()` API inside `beforeEach` to gate optional capability suites. **Jest is not a drop-in replacement** — swapping dev dependencies alone will break module resolution for `vitest` and the `ctx.skip()` calls.

To run the kit as shipped, install `vitest` ≥ 3.

If you must run it under Jest, you need to provide your own compatibility layer (for example, a `moduleNameMapper` that maps the `vitest` module to `@jest/globals`, plus a shim that translates `ctx.skip()` semantics). That setup is not covered here, so the supported path for the conformance kit is vitest.

## Documentation

- **Spec**: [`docs/mcp-memory-protocol-spec.md`](https://github.com/3062-in-zamud/knowledgine/blob/main/docs/mcp-memory-protocol-spec.md) — the normative protocol
- **Implementation guide**: [`docs/mcp-memory-protocol-proposal/implementation-guide.md`](https://github.com/3062-in-zamud/knowledgine/blob/main/docs/mcp-memory-protocol-proposal/implementation-guide.md) — step-by-step walkthrough
- **Gap analysis (knowledgine)**: [`docs/mcp-memory-protocol-proposal/gap-analysis.md`](https://github.com/3062-in-zamud/knowledgine/blob/main/docs/mcp-memory-protocol-proposal/gap-analysis.md) — knowledgine's spec compliance status
- **Migration guide**: [`MIGRATION.md`](./MIGRATION.md) — version-to-version upgrade notes

## Examples

Worked examples live in the repo at [`packages/mcp-memory-protocol/examples/`](https://github.com/3062-in-zamud/knowledgine/tree/main/packages/mcp-memory-protocol/examples):

- [`minimal-provider/`](https://github.com/3062-in-zamud/knowledgine/tree/main/packages/mcp-memory-protocol/examples/minimal-provider) — ~50-line in-memory `MemoryProvider` covering the required suite plus `versioning`. A starting template for new backends.
- [`knowledgine-provider/`](https://github.com/3062-in-zamud/knowledgine/tree/main/packages/mcp-memory-protocol/examples/knowledgine-provider) — wires `@knowledgine/core` migrations + `KnowledgineMemoryProvider` from `@knowledgine/mcp-server` into a stand-alone `MemoryProvider`. Covers the full optional capability set (`versioning`, `temporalQuery`, `ttl`, `layerPromotion`).

The examples are intentionally **not** shipped in the npm tarball because they use `workspace:*` dependencies and won't install outside the monorepo. Clone the repo and run `pnpm install` from the root to use them.

## License

MIT — see [`LICENSE`](./LICENSE).
