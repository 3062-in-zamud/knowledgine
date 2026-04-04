---
name: sdd-close
description: >
  Close out a completed spec. Verifies all acceptance criteria are met, updates spec status
  to completed, captures knowledge learned during implementation, and updates the spec index.
---

# sdd-close

## Purpose

Formally close a spec after its implementation has been merged. Ensures nothing is forgotten
and knowledge is preserved for future work.

## When to Use

- After PR is merged to `develop`
- After all acceptance criteria are verified as passing
- Before (or during) a release that includes the feature

## Arguments

- `$ARGUMENTS`: Spec ID (e.g., `KNOW-001`)

## Step-by-Step Instructions

### 1. Verify Completion

1. Read `specs/KNOW-{NNN}-*/requirements.md`
2. Confirm all acceptance criteria are checked off (or run `/sdd-validate`)
3. Confirm `pnpm verify` passes on `develop` branch

### 2. Update Spec Status

In `requirements.md`:

- Change `## Status` from `in-progress` or `review` to `completed`
- Add a `## Completed` section with:
  - Date completed
  - Release version (if known, or "pending release")
  - PR number

### 3. Capture Knowledge

Use `knowledgine-capture` to record:

- Key design decisions and their rationale
- Gotchas or surprises discovered during implementation
- Patterns that could be reused in future features
- Any deviations from the original design and why

### 4. Update Spec Index

In `specs/README.md`:

- Update the spec's status in the index table to `completed`

### 5. Report

Output to user:

- Spec closed: KNOW-{NNN} — {title}
- Knowledge captured: {number} items
- Status: completed
- Next steps (if any): suggest `/release` if ready

## Reference Files

- `docs/workflows/phase4-release.md` — Release process
- `specs/README.md` — Spec index to update
