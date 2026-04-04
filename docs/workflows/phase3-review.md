# Phase 3: Review

**Lead tool**: Codex (automated PR review), Claude Code (spec compliance)
**Input**: PR with implementation
**Output**: Review report, approval or change requests

## Review Flow

```
PR Created
  │
  ├─→ Codex: @codex review (automatic via GitHub App)
  │     │
  │     └─→ Reads AGENTS.md → applies review checklist
  │         Reads specs/KNOW-XXX/requirements.md → checks acceptance criteria
  │         Reports: pass/fail/warn per criterion
  │
  └─→ Claude Code: /sdd-review KNOW-XXX (manual, deeper analysis)
        │
        └─→ Requirements compliance check
            Design consistency check
            Task completion verification
            pnpm verify execution
```

## Codex Review

### Automatic (GitHub App)

If the Codex GitHub App is installed:

1. Create PR → Codex reviews automatically
2. Or comment `@codex review` on any PR

Codex reads:

- `AGENTS.md` for project rules and review checklist
- `specs/KNOW-XXX/requirements.md` for acceptance criteria
- The PR diff for implementation details

### Local CLI

```bash
codex /review
```

Useful for:

- Pre-push self-review
- Reviewing branch changes before PR creation
- Quick feedback loop during development

## Claude Code Review (`/sdd-review`)

```
/sdd-review KNOW-XXX
```

This performs a deeper spec compliance check:

### 1. Requirements Compliance

For each acceptance criterion in `requirements.md`:

- Does a corresponding test exist?
- Does the test pass?
- Is the implementation correct (not just passing)?

### 2. Design Consistency

Compare implementation against `design.md`:

- Do TypeScript interfaces match?
- Does the data flow match the described steps?
- Were design decisions followed?

### 3. Task Completion

Check `tasks.md`:

- Are all tasks checked off?
- Were any tasks skipped?
- Were any unplanned tasks added?

### 4. Code Quality (from AGENTS.md)

Apply the full review checklist from `AGENTS.md`:

- `pnpm verify` passes
- Tests added for all new behavior
- No unnecessary `any` types
- Error cases handled
- Conventional Commits used

## Handling Review Feedback

1. Fix issues in new commits (don't force-push during review)
2. Update `tasks.md` if new tasks were discovered
3. If a design change is needed, update `design.md` first
4. Re-run `pnpm verify` after fixes
5. Request re-review

## Review Checklist (Quick Reference)

See `AGENTS.md` > Review Checklist for the full list. Key items:

- [ ] Spec compliance (requirements, design, tasks)
- [ ] `pnpm verify` passes
- [ ] Tests for all new behavior
- [ ] No `any` without justification
- [ ] No secrets or credentials
- [ ] Conventional Commits
