# knowledgine

TypeScript ESM monorepo (pnpm workspaces). Developer Knowledge Infrastructure.

## Commands

- `pnpm build` / `pnpm verify` (build + typecheck + lint + format + tests)
- `pnpm test:run` (tests only) / `pnpm test:coverage`

## Build Order

mcp-memory-protocol -> core -> ingest -> mcp-server -> cli

## Key Rules

- ESM only. Use `.js` extensions in relative imports.
- Conventional Commits: `feat:`, `fix:`, `chore(deps):`, etc.
- PRs target `develop`, not `main`. Main is releases only.
- See CONTRIBUTING.md for full coding standards.

## Gotchas

- `better-sqlite3` requires C++ build tools (xcode-select --install on macOS)
- `onnxruntime-node` is optional for consumers, but required to run ONNX-based embedding tests when model files are present (tests are skipped based on model availability, not this package)
- Migrations must be registered in ALL_MIGRATIONS array (packages/core/src/index.ts)
- Migration `version` field (not filename prefix) determines execution order. Current max: 13
