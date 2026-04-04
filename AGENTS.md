# AGENTS.md

> This file is the tool-agnostic source of truth for AI agent behavior in this project. It is read by Claude Code, Cursor, Codex, and any other AI coding tool.

## Project Overview

**knowledgine** — Developer Knowledge Infrastructure. A TypeScript ESM monorepo that extracts, stores, and retrieves knowledge from developer workflows.

- **Version**: 0.6.3
- **License**: MIT
- **Runtime**: Node.js >= 20
- **Package Manager**: pnpm >= 9

## Build & Verify

```bash
pnpm install --frozen-lockfile
pnpm build                    # Build all packages
pnpm verify                   # build + typecheck + lint + format:check + test:run
pnpm test:run                 # Tests only
pnpm test:coverage            # Tests with coverage report
```

## Build Order

```
mcp-memory-protocol → core → ingest → mcp-server → cli
```

## Architecture

5 packages under `packages/`:

| Package               | npm Name                           | Responsibility                               |
| --------------------- | ---------------------------------- | -------------------------------------------- |
| `mcp-memory-protocol` | `@knowledgine/mcp-memory-protocol` | MCP memory protocol specification            |
| `core`                | `@knowledgine/core`                | Knowledge extraction, storage, search, graph |
| `ingest`              | `@knowledgine/ingest`              | Plugin-based data ingestion pipeline         |
| `mcp-server`          | `@knowledgine/mcp-server`          | MCP server exposing knowledge tools          |
| `cli`                 | `@knowledgine/cli`                 | CLI for indexing, serving, management        |

Dependency graph:

```
cli → mcp-server → core ← ingest
                    ↑
      mcp-memory-protocol
```

## Spec-Driven Development (SDD)

All features MUST have a specification in `specs/KNOW-{NNN}-description/`.

### For Implementers

1. **Read the full spec** before writing any code
2. Read `requirements.md` for acceptance criteria and constraints
3. Follow `design.md` for architecture and interfaces
4. Work through `tasks.md` in order, checking off items as you go
5. If the spec is ambiguous or wrong, **update the spec first**, then implement
6. Run `pnpm verify` after each task

### For Reviewers

1. Locate the matching spec in `specs/`
2. Verify implementation matches `requirements.md` acceptance criteria
3. Verify architecture follows `design.md`
4. Verify all tasks in `tasks.md` are addressed
5. Apply the review checklist below

### Spec References

- `specs/README.md` — SDD conventions and naming rules
- `docs/workflows/sdd-overview.md` — Full SDD workflow with tool roles

## Code Standards

### TypeScript

- **ESM only**. Always use `.js` extensions in relative imports.
- **Strict mode**. Avoid `any` without documented justification.
- Explicit return types on public APIs.
- Named exports only (no default exports).
- Prefer `interface` over `type` for object shapes.
- Use `readonly` for immutable properties.
- Prefer `unknown` over `any` for uncertain types.

### Import Order

1. Node.js built-ins
2. External packages
3. Internal packages (`@knowledgine/*`)
4. Relative imports

### General

- Small, focused functions
- Immutable data structures preferred
- `async`/`await` over raw Promises
- Handle errors explicitly, never swallow exceptions
- Self-documenting code; comments only for non-obvious "why"

## Testing

- **Framework**: Vitest
- **Coverage target**: 80%
- **Test location**: `tests/` directory or co-located `*.test.ts`
- **Style**: Descriptive `describe`/`it` blocks that read like specifications
- **Mocking**: Vitest built-in (`vi.fn()`, `vi.mock()`) only
- **Isolation**: Each test sets up and tears down its own state

## Review Checklist

When reviewing code (PR review, `/sdd-review`, `codex /review`):

### Spec Compliance

- [ ] Implementation matches `requirements.md` acceptance criteria
- [ ] Architecture consistent with `design.md`
- [ ] All tasks in `tasks.md` addressed

### Code Quality

- [ ] `pnpm verify` passes (build, typecheck, lint, format, tests)
- [ ] Tests added or updated for all new behavior
- [ ] No unnecessary `any` types
- [ ] Public APIs have explicit return types
- [ ] Error cases handled explicitly
- [ ] No secrets, credentials, or sensitive data
- [ ] Conventional Commits format used
- [ ] No unrelated changes bundled

### Security

- [ ] User input validated at system boundaries
- [ ] No hardcoded secrets or tokens
- [ ] SQL queries parameterized (better-sqlite3 binding syntax)
- [ ] File paths sanitized when user-provided

## Branching Strategy

```
feat/KNOW-{NNN}-description → develop → main (releases only)
```

- Feature branches target `develop`
- Only release PRs merge to `main`
- Merging to `main` triggers npm publish + GitHub Release

## Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/) with package scope:

```
feat(core): add vector similarity search
fix(cli): handle missing config file
docs(specs): create KNOW-001 requirements
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `ci`, `style`

## Agent Configuration

Skills, rules, and configuration files are managed in `.ai-agents/` (SSOT) with symlinks to tool-specific directories. See `.ai-agents/README.md` for details.
