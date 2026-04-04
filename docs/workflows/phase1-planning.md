# Phase 1: Planning

**Lead tool**: Claude Code
**Output**: `specs/KNOW-{NNN}-description/` with three files

## Step-by-Step

### 1. Initialize the Spec

```
/sdd-init
```

This creates the directory and populates templates. You'll be asked for:

- A short title (becomes the directory name)
- A one-line summary

### 2. Write requirements.md

Start with the **Problem Statement**. Be specific about who is affected and why it matters now.

Then write **Acceptance Criteria**. Each criterion must be testable:

Good:

```markdown
- [ ] AC-1: `knowledgine search "typescript"` returns results sorted by relevance score (descending)
- [ ] AC-2: Search completes in < 200ms for databases with up to 10,000 entries
```

Bad:

```markdown
- [ ] AC-1: Search should work well
- [ ] AC-2: Performance should be good
```

List **Constraints** (performance budgets, compatibility requirements, security needs) and **Affected Packages**.

Define **Out of Scope** explicitly to prevent scope creep.

### 3. Write design.md

Use `/sdd-analyze` to survey the existing codebase first. It will report:

- Current architecture patterns in affected packages
- Public APIs that will be modified
- Dependency relationships
- Test coverage of affected areas

Then write:

- **Architecture Overview**: How the feature fits into the existing system
- **Interface Definitions**: TypeScript types/interfaces for new or modified APIs
- **Data Flow**: Step-by-step path of data through the system
- **Key Design Decisions**: What you chose and why (document alternatives considered)
- **Testing Strategy**: High-level approach (unit, integration, edge cases)

### 4. Write tasks.md

Break the design into ordered tasks. Guidelines:

- Each task should be completable in **one session** (1-3 hours)
- Follow **TDD**: write test first, then implement
- Include `pnpm verify` checkpoints after each phase
- Mark prerequisites at the top

### 5. Review the Spec

Before implementation:

- Re-read requirements.md: are criteria actually testable?
- Re-read design.md: does it address all requirements?
- Re-read tasks.md: is the order correct? Any missing steps?

Use `/sdd-handoff` to generate a handoff report if passing to Cursor for implementation.

## Tips

- Use `knowledgine-recall` to check if similar features were built before
- Prefer simple designs. If the design feels complex, the requirements may need splitting
- Write specs in English for consistency with the codebase
- The first spec you write will feel slow. It gets faster with practice
