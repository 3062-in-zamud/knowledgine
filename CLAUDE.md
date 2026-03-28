# knowledgine

TypeScript ESM monorepo (pnpm workspaces). Developer Knowledge Infrastructure.

## Commands
- `pnpm build` / `pnpm verify` (build + typecheck + lint + format + tests)
- `pnpm test:run` (tests only) / `pnpm test:coverage`

## Build Order
mcp-memory-protocol (no deps) -> core -> ingest, mcp-server (parallel) -> cli

## Key Rules
- ESM only. Use `.js` extensions in relative imports.
- Conventional Commits: `feat:`, `fix:`, etc. No scope parentheses. No ticket IDs.
- PRs target `develop`, not `main`. Main is releases only.
- See CONTRIBUTING.md for full coding standards.

## Gotchas
- `better-sqlite3` requires C++ build tools (xcode-select --install on macOS)
- onnxruntime-node is optional -- embedding tests skip without it
- Migrations must be registered in ALL_MIGRATIONS array (core/src/storage/migrations/index.ts)
- Migration `version` field (not filename prefix) determines execution order. Current max: 13
