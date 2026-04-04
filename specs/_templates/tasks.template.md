# Tasks: {TITLE}

## Ticket ID

KNOW-{NNN}

## Prerequisites

<!-- What must be true before implementation starts? -->

- [ ] Spec reviewed and approved (requirements.md + design.md)
- [ ] Feature branch created: `feat/KNOW-{NNN}-{description}`
- [ ] Dependencies installed (if any new ones)

## Implementation Tasks

<!-- Order matters. Each task should be completable in a single session. Follow TDD: write test, then implement. Check off as you go. -->

### Phase 1: Foundation

- [ ] **Task 1**: Write tests for {component} (see design.md §{section})
- [ ] **Task 2**: Implement {component}
- [ ] **Task 3**: Verify `pnpm verify` passes

### Phase 2: Integration

- [ ] **Task 4**: Write integration tests for {feature}
- [ ] **Task 5**: Implement {integration}
- [ ] **Task 6**: Verify `pnpm verify` passes

### Phase 3: Polish

- [ ] **Task 7**: Update CLI help text / API docs (if applicable)
- [ ] **Task 8**: Run `pnpm test:coverage` and verify coverage target met
- [ ] **Task 9**: Final `pnpm verify`

## Verification Checklist

<!-- Run these before creating a PR. -->

- [ ] All acceptance criteria in requirements.md are met
- [ ] All tests pass: `pnpm test:run`
- [ ] Full verification: `pnpm verify`
- [ ] No unrelated changes included
- [ ] Conventional Commit messages used

## Notes

<!-- Any implementation notes, gotchas, or decisions made during implementation. Update as you work. -->

-
