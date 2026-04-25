# knowledgine-provider

A worked example showing how to compose `@knowledgine/core` modules into a `MemoryProvider`. This is the same wiring used by the production `KnowledgineMemoryProvider` in `@knowledgine/mcp-server` — distilled into a single file so you can read end-to-end how the pieces fit.

> ⚠️ **Do not run this example against your real `~/.knowledgine/*.db`.** It uses an in-memory SQLite database (`:memory:`) by design — every `createKnowledgineProvider()` call returns a fresh, throwaway store. It exists to demonstrate the API, not to serve a real workload.

## What it covers

- The four required operations (§5)
- Full optional capability set: `versioning`, `temporalQuery`, `ttl`, `layerPromotion`
- Real SQLite schema/migrations via `better-sqlite3` + `@knowledgine/core`
- Per-test isolation: `createKnowledgineProvider()` builds a new database each call

## What it does NOT cover

- `semanticSearch` — declared `false` (memory-layer embedding is deferred)
- File-backed databases or production-grade migrations — keep `:memory:` for the example

## 30-second setup

This example lives inside the knowledgine monorepo and uses workspace dependencies (`@knowledgine/core`, `@knowledgine/mcp-memory-protocol`, `@knowledgine/mcp-server`). It does not run outside the monorepo as-is. To run:

```bash
# from the repo root
pnpm install
pnpm --filter @knowledgine-examples/knowledgine-provider test
# or run only the type check:
pnpm --filter @knowledgine-examples/knowledgine-provider typecheck
```

The test command runs `runConformanceSuite({ createProvider, teardown })` with a fresh in-memory SQLite database for every spec, exercising the full required + versioning + temporal_query + ttl suites.

## Adapting this for your own database

The key insight is that `KnowledgineMemoryProvider` is just an adapter over a `better-sqlite3` connection plus the `@knowledgine/core` migration set. To swap the backend, you can either:

1. **Reuse the adapter unchanged**: open your own SQLite handle and run the knowledgine migrations against it. This is the example here.
2. **Write your own provider**: if you're not on SQLite, copy the structure of `packages/mcp-server/src/memory-adapter.ts` (in the repo root) and replace the `db.prepare(...)` calls with your storage layer.

See `docs/mcp-memory-protocol-proposal/implementation-guide.md` for a step-by-step walkthrough that covers both paths.
