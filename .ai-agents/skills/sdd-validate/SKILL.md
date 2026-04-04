---
name: sdd-validate
description: >
  Validate that implementation satisfies spec acceptance criteria. Maps each criterion in
  requirements.md to corresponding tests, runs them, and reports pass/fail per criterion.
  Use after implementation, before PR creation.
---

# sdd-validate

## Purpose

Verify that the implementation actually satisfies what was specified. Catches gaps between
requirements and implementation before the review phase.

## When to Use

- After completing all tasks in tasks.md
- Before creating a PR
- During implementation to check partial progress

## Arguments

- `$ARGUMENTS`: Spec ID (e.g., `KNOW-001`) or path to spec directory

## Step-by-Step Instructions

### 1. Load Acceptance Criteria

Read `specs/KNOW-{NNN}-*/requirements.md` and extract all acceptance criteria (AC-1, AC-2, ...).

### 2. Map Criteria to Tests

For each acceptance criterion:

1. Search the test files for tests that exercise this criterion
2. Look for test descriptions that mention the criterion or its key behavior
3. If no test found, flag as **UNCOVERED**

### 3. Run Tests

```bash
pnpm test:run
```

### 4. Check Design Compliance

Compare implementation against `design.md`:

- Do exported interfaces match what was designed?
- Does the data flow match the described steps?
- Were key design decisions followed?

### 5. Generate Report

```markdown
## Validation Report: KNOW-{NNN}

### Acceptance Criteria Coverage

| Criterion | Test File | Status                  |
| --------- | --------- | ----------------------- |
| AC-1: ... | tests/... | PASS / FAIL / UNCOVERED |
| AC-2: ... | tests/... | PASS / FAIL / UNCOVERED |

### Design Compliance

- [ ] Interfaces match design.md
- [ ] Data flow matches design.md
- [ ] Design decisions followed

### Build Status

pnpm verify: PASS / FAIL

### Coverage

pnpm test:coverage: XX% (target: 80%)

### Summary

X/Y acceptance criteria covered and passing.
Z criteria need attention.
```

## Reference Files

- `docs/workflows/phase2-implementation.md` — Implementation standards
- `.ai-agents/config/review-checklist.md` — Full review checklist
