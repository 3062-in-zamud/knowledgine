# Handoff Report: KNOW-{NNN} — {Title}

## Spec Location

`specs/KNOW-{NNN}-{description}/`

## Summary

<!-- One paragraph: what this feature does and why it matters. -->

## Current Progress

### tasks.md Status

- Completed: X / Y tasks
- Next task: Task N — {description}

### Branch

- Branch name: `feat/KNOW-{NNN}-{description}`
- Based on: `develop` (commit: {hash})

### Build Status

```
pnpm verify: PASS / FAIL
  build:     ✓
  typecheck: ✓
  lint:      ✓
  format:    ✓
  tests:     ✓
```

## Key Decisions Made

<!-- Decisions made during planning or partial implementation that the next implementer should know. -->

1.
2.

## Deviations from Spec

<!-- If anything was changed from the original design, note it here. -->

None (or list deviations with reasons)

## Watch Out For

<!-- Gotchas, known issues, or areas that need special attention. -->

-

## Files to Focus On

<!-- Key files the implementer will be working with. -->

-

## How to Continue

1. `git checkout feat/KNOW-{NNN}-{description}`
2. Read `specs/KNOW-{NNN}-{description}/tasks.md` — start from the first unchecked task
3. Follow the TDD cycle described in `docs/workflows/phase2-implementation.md`
4. Run `pnpm verify` after each task
