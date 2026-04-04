# SDD Workflow Rules

> This file is the SSOT for SDD workflow rules. It is symlinked to `.cursor/rules/sdd-workflow.md` and referenced by all AI tools.

## Before Implementing Any Feature

1. **Check for a spec**: Look in `specs/KNOW-{NNN}-description/`
2. **If a spec exists**: Follow it strictly
   - `requirements.md`: acceptance criteria you MUST satisfy
   - `design.md`: architecture, interfaces, patterns to follow
   - `tasks.md`: ordered implementation steps — work through in order
3. **If no spec exists**: Ask the user to create one, or create it yourself with `/sdd-init`
4. **If the spec is wrong**: Update the spec first, then implement

## During Implementation

- Follow **TDD**: write test first, implement, refactor
- Check off tasks in `tasks.md` as you complete them
- Run `pnpm verify` after each completed task phase
- Commit after each task (not in bulk at the end)

## Code Standards (knowledgine-specific)

- **ESM only**. Always use `.js` extension in relative imports
- **TypeScript strict mode**. No `any` unless justified
- **Named exports only**. No default exports
- **Vitest** for tests. Place in `tests/` or co-locate as `*.test.ts`
- **Import order**: Node builtins → external → `@knowledgine/*` → relative
- **Explicit return types** on public APIs

## Before Marking Work Complete

- [ ] All acceptance criteria in `requirements.md` are met
- [ ] Architecture matches `design.md`
- [ ] All tasks in `tasks.md` checked off
- [ ] `pnpm verify` passes
- [ ] `pnpm test:coverage` meets 80% target
- [ ] Conventional Commit messages used

## References

- `AGENTS.md` — Full project rules and review checklist
- `CONTRIBUTING.md` — Detailed coding standards
- `specs/README.md` — SDD conventions and naming rules
- `docs/workflows/sdd-overview.md` — Full SDD workflow with tool roles
