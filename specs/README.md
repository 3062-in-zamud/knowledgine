# Spec-Driven Development (SDD) for knowledgine

## What is SDD?

Spec-Driven Development is a workflow where **specifications are written before code**. Each feature gets a dedicated spec directory with three files that define what to build, how to build it, and in what order. AI agents (Claude Code, Cursor, Codex) all reference these specs as the source of truth.

## Directory Structure

```
specs/
├── README.md                    ← You are here
├── _templates/                  ← Templates for new specs
│   ├── requirements.template.md
│   ├── design.template.md
│   └── tasks.template.md
├── KNOW-001-feature-name/       ← Example spec
│   ├── requirements.md          ← What to build
│   ├── design.md                ← How to build it
│   └── tasks.md                 ← Implementation steps
└── ...
```

## Naming Convention

- **Format**: `KNOW-{NNN}-{kebab-case-description}/`
- **Numbering**: Sequential, starting from the next available number below
- **Examples**: `KNOW-001-hybrid-search-v2/`, `KNOW-002-toml-config-support/`

## Next Available Number

**KNOW-001** (first spec)

> Update this number each time a new spec is created.

## Spec Index

| ID           | Title | Status | Created |
| ------------ | ----- | ------ | ------- |
| _(none yet)_ |       |        |         |

## The Three Files

### requirements.md — What to build

Defines the problem, acceptance criteria, constraints, and scope. This is the contract between the person requesting the feature and the implementer (human or AI).

Key sections:

- Problem Statement
- Acceptance Criteria (testable, specific)
- Constraints (performance, compatibility, security)
- Affected Packages
- Out of Scope

### design.md — How to build it

Defines the technical approach: architecture, interfaces, data flow, and key decisions. Written after requirements are finalized.

Key sections:

- Architecture Overview
- Interface Definitions (TypeScript types/interfaces)
- Data Flow
- Key Design Decisions (with rationale)
- Migration Strategy (if applicable)

### tasks.md — Implementation steps

Breaks the design into ordered, checkable tasks. Each task should be completable in a single session. Tasks follow TDD: write test first, then implement.

Key sections:

- Prerequisites
- Ordered Task List (with checkboxes)
- Verification Steps

## Status Lifecycle

```
draft → in-progress → review → completed
```

| Status        | Meaning                                             |
| ------------- | --------------------------------------------------- |
| `draft`       | Spec is being written, not ready for implementation |
| `in-progress` | Implementation has started                          |
| `review`      | Implementation complete, under review               |
| `completed`   | Merged and released                                 |

## How to Use (by Tool)

### Claude Code

```
/sdd-init          # Create a new spec directory with templates
/sdd-spec KNOW-001 # Generate/refine the three spec files
/sdd-status        # View all specs and their status
```

### Cursor

1. Read `.cursor/rules/sdd-workflow.md` (loaded automatically)
2. When implementing, reference `specs/KNOW-XXX/` as instructed
3. Follow `tasks.md` checkboxes in order
4. Run `pnpm verify` before considering work complete

### Codex

1. Reads `AGENTS.md` which references `specs/` for review criteria
2. On PR review, checks implementation against `requirements.md` acceptance criteria
3. Verifies architecture matches `design.md`

## Workflow Reference

For detailed phase-by-phase instructions, see `docs/workflows/`:

- `sdd-overview.md` — Full SDD flow with tool role assignments
- `phase1-planning.md` — How to write specs
- `phase2-implementation.md` — How to implement from specs
- `phase3-review.md` — How to review against specs
- `phase4-release.md` — How to close out specs after release
