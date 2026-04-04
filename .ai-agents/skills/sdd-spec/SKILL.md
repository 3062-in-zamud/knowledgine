---
name: sdd-spec
description: >
  Generate or refine the three SDD spec files (requirements.md, design.md, tasks.md) for an
  existing spec directory. Analyzes the codebase, conducts user dialogue for requirements,
  and produces implementation-ready specifications.
---

# sdd-spec

## Purpose

Write high-quality specifications that AI agents can follow to implement features correctly.
This skill guides the creation of all three spec files in sequence, ensuring they are
internally consistent and actionable.

## When to Use

- After `/sdd-init` has created the spec directory with templates
- To refine or update an existing spec that needs improvement
- When requirements have changed and the spec needs updating

## Arguments

- `$ARGUMENTS`: Spec ID (e.g., `KNOW-001`) or path to spec directory

## Step-by-Step Instructions

### Phase 1: Analyze Context

1. **Read the spec directory** to see what's already written
2. **Run `/sdd-analyze`** (or equivalent analysis) on affected packages:
   - Current architecture patterns
   - Public APIs that will be touched
   - Existing test coverage
   - Related past knowledge via `knowledgine-recall`
3. **Identify affected packages** from the template checklist

### Phase 2: Requirements (requirements.md)

1. **Dialogue with the user** to understand:
   - What problem does this solve? Who is affected?
   - What does "done" look like? (acceptance criteria)
   - What are the constraints? (performance, compatibility, security)
   - What is explicitly out of scope?

2. **Write acceptance criteria** that are:
   - **Testable**: Each criterion maps to a concrete test
   - **Specific**: No vague terms like "should work well"
   - **Complete**: Cover happy path, error cases, edge cases

3. **Update `requirements.md`** with:
   - Problem Statement
   - Acceptance Criteria (all checkboxes)
   - Constraints
   - Affected Packages (checked)
   - Out of Scope
   - Status: `draft`

### Phase 3: Design (design.md)

1. **Based on requirements + code analysis**, design the solution:
   - Architecture Overview (how it fits into existing system)
   - Interface Definitions (TypeScript types/interfaces)
   - Data Flow (step-by-step)
   - Key Design Decisions (with alternatives and rationale)

2. **Validate** that:
   - Every acceptance criterion is addressed by the design
   - Interfaces follow existing patterns in the codebase
   - Data flow is complete (no gaps)

3. **Update `design.md`** with all sections

### Phase 4: Tasks (tasks.md)

1. **Break design into ordered tasks**:
   - Each task completable in 1-3 hours
   - TDD order: write test → implement → verify
   - Include `pnpm verify` checkpoints between phases

2. **Add prerequisites** (branch creation, dependency installation)

3. **Add verification checklist** at the bottom

4. **Update `tasks.md`** with all sections

### Phase 5: Consistency Check

1. Re-read all three files
2. Verify:
   - Every acceptance criterion has a corresponding design element
   - Every design element has corresponding tasks
   - Task order respects dependencies
   - No orphaned sections (designed but not required, or tasked but not designed)

## Best Practices

- Write for an AI agent that has never seen this codebase — be explicit
- Use actual TypeScript in interface definitions (not pseudocode)
- Reference specific files and line numbers when describing existing code
- Keep acceptance criteria to 3-8 items (split large features into multiple specs)
- Design decisions should include "why not" for rejected alternatives

## Reference Files

- `specs/_templates/` — Template structure
- `docs/workflows/phase1-planning.md` — Detailed planning guidance
- `AGENTS.md` — Code standards that design must follow
- `CONTRIBUTING.md` — Full coding standards reference
