# minimal-provider

A ~50-line in-memory `MemoryProvider` implementation. Demonstrates a minimal MCP Memory Protocol example — the four required operations plus the `versioning` capability so the conformance suite has a real chain to validate against.

> ⚠️ **Do not put production data through this example.** It stores everything in a `Map`, has no persistence, no concurrency control, and no authentication. It is intentionally minimal, exists purely to teach the protocol shape, and should not be read as a complete implementation of every protocol semantic.

## What it covers

- `store_memory` / `recall_memory` / `update_memory` / `forget_memory` (§5)
- Error contract: throws `MemoryProtocolError` with codes (§7)
- `RecalledMemory` shape with `deprecated` / `deprecationReason` / `supersedes` / `validFrom` (§6.1)
- Version chain via `update_memory(createVersion: true)` (§8)

## What it does NOT cover

- `temporal_query` (asOf) — no historical valid_until tracking
- `ttl` — no expiration logic
- `semantic_search` — no embeddings
- `layer_promotion` — no auto re-layering

These optional capabilities are declared `false` by `capabilities()`, so the conformance suite skips them transparently.

## 30-second setup

This example lives inside the knowledgine monorepo and uses
`"@knowledgine/mcp-memory-protocol": "workspace:*"`. **It does not run outside the monorepo as-is** — the workspace dependency only resolves via `pnpm-workspace.yaml`. To run:

```bash
# from the repo root
pnpm install
pnpm --filter @knowledgine-examples/minimal-provider test
# or run the type check on its own:
pnpm --filter @knowledgine-examples/minimal-provider typecheck
```

The test command runs the full required conformance suite plus the versioning capability suite against `MinimalInMemoryProvider`. All assertions should pass.

## Adapting this for your own backend

1. Copy `src/index.ts` and rename the class.
2. Replace the `Map<string, Row>` with calls to your storage layer.
3. Decide which optional capabilities to support and update `capabilities()` accordingly.
4. Write a `test.ts` that calls `runConformanceSuite({ createProvider })` against your class.
5. Iterate until vitest reports green.

See `docs/mcp-memory-protocol-proposal/implementation-guide.md` (in the repo root) for a step-by-step walkthrough.
