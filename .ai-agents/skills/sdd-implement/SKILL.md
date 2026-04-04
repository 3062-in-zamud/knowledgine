---
name: sdd-implement
description: >
  Implement features by working through tasks.md step by step with TDD. Reads the full spec
  (requirements.md, design.md, tasks.md), implements each task in order, and updates progress.
  Works in both Claude Code and Cursor.
---

# sdd-implement

## Purpose

Execute the implementation phase of SDD by following `tasks.md` systematically. Ensures
each task is implemented with TDD discipline and spec compliance.

## When to Use

- After spec is complete (requirements.md + design.md + tasks.md finalized)
- To resume implementation of a partially completed spec
- When picking up implementation from a handoff report

## Arguments

- `$ARGUMENTS`: Spec ID (e.g., `KNOW-001`) or path to spec directory

## Step-by-Step Instructions

### 1. Load Context

1. Read the full spec:
   - `specs/KNOW-{NNN}-*/requirements.md` — acceptance criteria
   - `specs/KNOW-{NNN}-*/design.md` — architecture, interfaces
   - `specs/KNOW-{NNN}-*/tasks.md` — ordered task list

2. Check current progress: which tasks are already checked off?

3. If there's a handoff report, read it for additional context

### 2. For Each Unchecked Task

Execute the TDD cycle:

**Red** (Write failing test):

```
1. Read the task description and the relevant design.md section
2. Write a test that expresses the expected behavior
3. Run: pnpm test:run → confirm test FAILS
```

**Green** (Make it pass):

```
1. Write minimal code following design.md interfaces
2. Run: pnpm test:run → confirm test PASSES
3. Don't over-engineer; just satisfy the test
```

**Refactor**:

```
1. Clean up the implementation (if needed)
2. Run: pnpm verify → confirm everything still passes
```

**Update Progress**:

```
1. Check off the task in tasks.md: - [x] Task N
2. If the task was the last in a phase, run pnpm verify as a checkpoint
```

### 3. Handle Deviations

If during implementation you discover:

- **Missing task**: Add it to tasks.md before implementing
- **Design needs change**: Update design.md first, then implement
- **Requirement unclear**: Check requirements.md; if still unclear, ask the user
- **Spec is wrong**: Update the spec, then implement the correct version

### 4. Complete Implementation

After all tasks are checked off:

1. Run `pnpm verify` one final time
2. Run `pnpm test:coverage` to check coverage target (80%)
3. Update spec status to `review` in requirements.md
4. Create PR against `develop` with spec reference in description

## Best Practices

- Never skip a task or implement out of order
- Commit after each task (atomic commits, Conventional Commits)
- If you get stuck, check `knowledgine-recall` for similar past work
- Record learnings with `knowledgine-capture` as you go

## Reference Files

- `docs/workflows/phase2-implementation.md` — Detailed implementation guidance
- `AGENTS.md` — Code standards to follow
- `CONTRIBUTING.md` — Full coding standards reference
