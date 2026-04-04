# Review Checklist

> Canonical checklist for all reviews (manual, Codex, `/sdd-review`). Referenced by `AGENTS.md`.

## Spec Compliance

- [ ] Implementation matches ALL acceptance criteria in `requirements.md`
- [ ] Architecture consistent with `design.md` interfaces and data flow
- [ ] All tasks in `tasks.md` addressed and checked off
- [ ] No undocumented deviations from spec (if deviations exist, spec is updated)

## Build & Tests

- [ ] `pnpm verify` passes (build + typecheck + lint + format + tests)
- [ ] Tests added or updated for all new behavior
- [ ] Test coverage meets 80% target (`pnpm test:coverage`)
- [ ] Tests are isolated (no shared state between tests)

## Code Quality

- [ ] No unnecessary `any` types (each `any` has a comment explaining why)
- [ ] Public APIs have explicit return types
- [ ] Named exports only (no default exports)
- [ ] ESM patterns: `.js` extensions in all relative imports
- [ ] Import order: Node builtins → external → @knowledgine/\* → relative
- [ ] Error cases handled explicitly (no swallowed exceptions)
- [ ] Small, focused functions

## Git & Process

- [ ] Conventional Commit messages used
- [ ] No unrelated changes bundled in the PR
- [ ] Feature branch targets `develop` (not `main`)
- [ ] PR description references the spec: `specs/KNOW-{NNN}-description/`

## Security

- [ ] No secrets, credentials, or tokens committed
- [ ] User input validated at system boundaries
- [ ] SQL queries use parameterized bindings (not string interpolation)
- [ ] File paths sanitized when user-provided
- [ ] No eval() or dynamic code execution with user input

## Documentation

- [ ] Public API changes reflected in JSDoc comments
- [ ] README updated if usage changed
- [ ] CHANGELOG entry added (for release PRs)
