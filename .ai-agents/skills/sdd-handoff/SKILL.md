---
name: sdd-handoff
description: >
  Generate a handoff report for transitioning work between tools (Claude Code to Cursor,
  or vice versa). Summarizes spec status, progress, decisions made, and how to continue.
---

# sdd-handoff

## Purpose

Create a structured report that enables another AI tool (or a future session) to pick up
implementation seamlessly. Eliminates context loss during tool transitions.

## When to Use

- Transitioning from Claude Code (planning) to Cursor (implementation)
- Transitioning from Cursor back to Claude Code (for review or complex logic)
- Ending a session with incomplete work

## Arguments

- `$ARGUMENTS` (optional): Spec ID (e.g., `KNOW-001`). If omitted, detect from current context.

## Step-by-Step Instructions

1. **Identify the active spec** from arguments or context (git branch name, recent files)

2. **Read current state**:
   - `specs/KNOW-{NNN}-*/tasks.md` — count completed vs total tasks
   - `specs/KNOW-{NNN}-*/requirements.md` — acceptance criteria status
   - Current git branch and recent commits
   - `pnpm verify` result

3. **Collect decisions and deviations**:
   - Any design decisions made during implementation
   - Any deviations from the original spec (and reasons)
   - Watch-out items or gotchas discovered

4. **Generate handoff report** using the template from `docs/workflows/handoff-template.md`:
   - Spec location
   - Summary
   - Progress (tasks completed / total)
   - Branch name and base commit
   - Build status
   - Key decisions made
   - Deviations from spec
   - Watch-out items
   - Key files to focus on
   - How to continue (step-by-step)

5. **Output the report** to the user. Optionally write to a file if requested.

## Reference Files

- `docs/workflows/handoff-template.md` — Report template
- `docs/workflows/sdd-overview.md` — Tool role assignments
