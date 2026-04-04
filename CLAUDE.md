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

## SDD (Spec-Driven Development)

Features are specified in `specs/KNOW-{NNN}-description/` with three files:

- `requirements.md` — What to build (acceptance criteria)
- `design.md` — How to build it (architecture, interfaces)
- `tasks.md` — Implementation steps (ordered, checkable)

Before implementing: check `specs/` for existing spec. Follow it strictly.
See `docs/workflows/sdd-overview.md` for the full SDD workflow.
See `AGENTS.md` for review checklist and code standards.

### Harness Integration

When `/work` loads a task with a `Spec: specs/KNOW-XXX/` reference:

1. Read the referenced spec (requirements.md, design.md)
2. Implement according to the spec
3. After task completion, update tasks.md checkbox
4. If implementation deviates from spec, update spec first

### Agent Configuration

Skills and rules are managed in `.ai-agents/` (SSOT). See `.ai-agents/README.md`.
Symlinks: `.claude/skills/sdd-*` → `.ai-agents/skills/sdd-*`

## Gotchas

- `better-sqlite3` requires C++ build tools (xcode-select --install on macOS)
- `onnxruntime-node` is optional for consumers, but required to run ONNX-based embedding tests when model files are present (tests are skipped based on model availability, not this package)
- Migrations must be registered in ALL_MIGRATIONS array (packages/core/src/index.ts)
- Migration `version` field (not filename prefix) determines execution order. Current max: 13
