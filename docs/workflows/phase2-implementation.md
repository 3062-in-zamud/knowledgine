# Phase 2: Implementation

**Lead tool**: Cursor (or Claude Code for complex backend work)
**Input**: Completed spec in `specs/KNOW-{NNN}-description/`
**Output**: Working code + tests + PR

## Before You Start

1. Read the full spec: `requirements.md`, `design.md`, `tasks.md`
2. Create a feature branch: `feat/KNOW-{NNN}-description`
3. If you received a handoff report, review it for context and decisions

## TDD Cycle

For each task in `tasks.md`:

```
1. Write a failing test (Red)
   - Test should express the acceptance criterion or design interface
   - Run: pnpm test:run → confirm it fails

2. Write minimal code to pass (Green)
   - Follow design.md interfaces exactly
   - Don't over-engineer; just make the test pass
   - Run: pnpm test:run → confirm it passes

3. Refactor (Refactor)
   - Clean up without changing behavior
   - Run: pnpm verify → confirm everything still passes

4. Check off the task in tasks.md
```

## Working with Specs During Implementation

### Following design.md

- Use the TypeScript interfaces defined in design.md as your starting point
- If you need to deviate from the design, **update design.md first** with the reason
- Data flow should match the steps described in design.md

### Checking Acceptance Criteria

As you implement, mentally map each acceptance criterion to a test:

```
AC-1: "Search returns results sorted by relevance" → test: search-sorting.test.ts
AC-2: "Search completes in < 200ms"               → test: search-performance.test.ts
```

Use `/sdd-validate KNOW-{NNN}` to generate this mapping automatically.

## Code Standards (Quick Reference)

- ESM only, `.js` extensions in imports
- No `any` without justification
- Named exports only
- Explicit return types on public APIs
- Vitest for tests, descriptive `describe`/`it` blocks

Full standards: see `AGENTS.md` or `CONTRIBUTING.md`

## Completing Implementation

1. All tasks in `tasks.md` checked off
2. Run `pnpm verify` one final time
3. Run `pnpm test:coverage` to check coverage target (80%)
4. Create PR against `develop`
5. Reference the spec in the PR description:
   ```
   ## Spec
   See `specs/KNOW-{NNN}-description/` for full specification.
   ```

## Handing Back to Review

After creating the PR:

- Codex will review automatically if GitHub App is configured (`@codex review`)
- Or run `codex /review` locally for immediate feedback
- Or use `/sdd-review KNOW-{NNN}` in Claude Code for spec compliance check

## Tips

- Don't implement tasks out of order — dependencies matter
- If you discover a missing task, add it to tasks.md before implementing
- Commit after each completed task (not at the end)
- Use `pnpm verify` liberally — it catches issues early
