---
name: sdd-review
description: >
  Perform a comprehensive spec compliance review. Combines AGENTS.md review checklist with
  spec-specific checks against requirements.md, design.md, and tasks.md. Produces a structured
  review report with pass/fail/warn per item.
---

# sdd-review

## Purpose

Ensure implementation is complete, correct, and compliant with both the spec and project
standards. This is the Claude Code counterpart to Codex's automated PR review.

## When to Use

- After implementation is complete and PR is created
- As a pre-review self-check before requesting Codex review
- When reviewing someone else's implementation against a spec

## Arguments

- `$ARGUMENTS`: Spec ID (e.g., `KNOW-001`) or PR number

## Step-by-Step Instructions

### 1. Load Review Context

1. Read the full spec: `specs/KNOW-{NNN}-*/`
2. Read the review checklist: `.ai-agents/config/review-checklist.md`
3. Read the diff (if PR number provided, use `gh pr diff`)
4. Read `AGENTS.md` for project-level rules

### 2. Spec Compliance Check

For each acceptance criterion in `requirements.md`:

- Verify a corresponding test exists
- Verify the test passes
- Verify the implementation actually satisfies the criterion (not just a superficial test)

For `design.md`:

- Compare TypeScript interfaces in code vs design
- Verify data flow implementation matches design
- Check that design decisions were followed (not violated)

For `tasks.md`:

- Verify all tasks are checked off
- Identify any unplanned tasks that were added
- Check for skipped tasks

### 3. Code Quality Check (from AGENTS.md)

Apply the full review checklist:

- `pnpm verify` passes
- Tests added for all new behavior
- No unnecessary `any` types
- Public APIs have explicit return types
- Error cases handled
- No secrets or credentials
- Conventional Commits format
- ESM patterns followed (.js extensions, named exports)

### 4. Security Check

- User input validated at boundaries
- SQL queries parameterized
- File paths sanitized
- No hardcoded secrets

### 5. Generate Review Report

```markdown
## Review Report: KNOW-{NNN}

### Spec Compliance

| Check                   | Status         | Notes    |
| ----------------------- | -------------- | -------- |
| AC-1: ...               | PASS/FAIL/WARN | ...      |
| AC-2: ...               | PASS/FAIL/WARN | ...      |
| Design interfaces match | PASS/FAIL      | ...      |
| Data flow matches       | PASS/FAIL      | ...      |
| All tasks complete      | PASS/FAIL      | X/Y done |

### Code Quality

| Check                  | Status    |
| ---------------------- | --------- |
| pnpm verify            | PASS/FAIL |
| Tests for new behavior | PASS/WARN |
| No unnecessary any     | PASS/WARN |
| Explicit return types  | PASS/WARN |
| Error handling         | PASS/WARN |
| Conventional Commits   | PASS/FAIL |

### Security

| Check                | Status    |
| -------------------- | --------- |
| Input validation     | PASS/N/A  |
| SQL parameterization | PASS/N/A  |
| No secrets           | PASS/FAIL |

### Verdict

APPROVE / REQUEST CHANGES / COMMENT

### Action Items (if any)

1. ...
2. ...
```

## Reference Files

- `.ai-agents/config/review-checklist.md` — Full checklist
- `AGENTS.md` — Project rules and standards
- `docs/workflows/phase3-review.md` — Review process details
