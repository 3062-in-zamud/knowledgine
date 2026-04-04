---
name: sdd-status
description: >
  Display a dashboard of all specs and their progress. Shows status, completion percentage,
  and last update for each spec in specs/. Quick overview of the SDD pipeline.
---

# sdd-status

## Purpose

Provide a quick overview of all specs and their current state. Useful at the start of a
session to decide what to work on, or to check overall progress.

## When to Use

- At the start of a work session
- To decide which spec to work on next
- To check if all specs are closed before a release
- When asked "what's the status of specs?"

## Arguments

- `$ARGUMENTS` (optional): Filter by status (e.g., `in-progress`, `draft`)

## Step-by-Step Instructions

1. **Scan `specs/` directory** for all `KNOW-*` directories

2. **For each spec**, read `requirements.md` to extract:
   - Title (from `# Requirements: {title}`)
   - Status (from `## Status`)
   - Number of acceptance criteria (total and checked)

3. **Read `tasks.md`** to extract:
   - Total tasks and completed tasks

4. **Generate dashboard**:

```markdown
## SDD Status Dashboard

| Spec     | Title              | Status      | AC  | Tasks | Last Updated |
| -------- | ------------------ | ----------- | --- | ----- | ------------ |
| KNOW-001 | Push-based capture | in-progress | 3/5 | 6/10  | 2026-04-04   |
| KNOW-002 | TOML config        | draft       | 0/4 | 0/8   | 2026-04-03   |

### Summary

- Draft: 1
- In Progress: 1
- Review: 0
- Completed: 0
- Total: 2
```

5. **If filtered**, show only matching specs

## Reference Files

- `specs/README.md` — Spec index (may be out of sync; dashboard reads actual files)
