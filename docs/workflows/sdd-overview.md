# SDD Workflow Overview

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Spec-Driven Development                      │
│                                                                 │
│  Phase 1          Phase 2          Phase 3         Phase 4      │
│  PLANNING         IMPLEMENTATION   REVIEW          RELEASE      │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐   ┌──────────┐  │
│  │Claude Code│───>│  Cursor  │───>│  Codex   │──>│Claude Code│  │
│  │          │    │          │    │          │   │          │  │
│  │ Write    │    │ Build    │    │ Review   │   │ Close    │  │
│  │ specs    │    │ code     │    │ PR       │   │ spec     │  │
│  └──────────┘    └──────────┘    └──────────┘   └──────────┘  │
│                                                                 │
│  Artifacts:       Artifacts:       Artifacts:     Artifacts:    │
│  requirements.md  src/ changes     Review report  Status update │
│  design.md        tests            LGTM / fixes   CHANGELOG    │
│  tasks.md         PR                              git tag       │
└─────────────────────────────────────────────────────────────────┘
```

## Tool Role Matrix

| Phase             |            Claude Code            |            Cursor             |               Codex               |
| ----------------- | :-------------------------------: | :---------------------------: | :-------------------------------: |
| 1. Planning       |      **Lead**: writes specs       | Assist: can help explore code |                 -                 |
| 2. Implementation | Assist: complex logic, debugging  |  **Lead**: daily coding, TDD  |                 -                 |
| 3. Review         |       Assist: local review        |               -               | **Lead**: PR review via AGENTS.md |
| 4. Release        | **Lead**: version, changelog, tag |               -               |                 -                 |
| Cross-cutting     |     Knowledge capture/recall      |               -               |      Automated review on PR       |

## Daily Workflow Example

```
Morning:
  $ claude
  > /sdd-init         → Create new spec KNOW-042-push-capture
  > /sdd-spec KNOW-042 → Write requirements, design, tasks
  > /sdd-handoff       → Generate handoff report for Cursor

Midday (Cursor):
  Open specs/KNOW-042-push-capture/
  Follow tasks.md step by step
  TDD: write test → implement → verify
  Create PR when done

Afternoon:
  Codex: @codex review (or codex /review locally)
  Review against AGENTS.md + specs/KNOW-042/requirements.md
  Address feedback → push fixes

Evening:
  $ claude
  > /sdd-close KNOW-042 → Mark complete, capture knowledge
  > /release            → If ready for release
```

## Skills/Commands by Phase

### Phase 1: Planning (Claude Code)

| Command              | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `/sdd-init`          | Create new spec directory with templates    |
| `/sdd-spec KNOW-XXX` | Generate/refine requirements, design, tasks |
| `/sdd-analyze`       | Analyze existing code to inform design      |
| `/sdd-handoff`       | Generate handoff report for Cursor          |

### Phase 2: Implementation (Cursor / Claude Code)

| Command                   | Purpose                              |
| ------------------------- | ------------------------------------ |
| `/sdd-implement KNOW-XXX` | Work through tasks.md with TDD       |
| `/sdd-validate KNOW-XXX`  | Check acceptance criteria coverage   |
| `pnpm verify`             | Full build + typecheck + lint + test |

### Phase 3: Review (Codex / Claude Code)

| Command                | Purpose                      |
| ---------------------- | ---------------------------- |
| `@codex review`        | Automated PR review (GitHub) |
| `codex /review`        | Local CLI review             |
| `/sdd-review KNOW-XXX` | Spec compliance review       |

### Phase 4: Release (Claude Code)

| Command               | Purpose                               |
| --------------------- | ------------------------------------- |
| `/sdd-close KNOW-XXX` | Mark spec complete, capture knowledge |
| `/release`            | Version bump, changelog, git tag      |
| `/sdd-status`         | Dashboard of all specs                |

### Cross-cutting

| Command                | Purpose                            |
| ---------------------- | ---------------------------------- |
| `/sdd-sync`            | Sync specs/tasks.md with Plans.md  |
| `/sdd-status`          | View all specs and their progress  |
| `/knowledgine-capture` | Record learnings to knowledge base |
| `/knowledgine-recall`  | Search past knowledge              |

## FAQ

**Q: Do I need a spec for every change?**
A: No. Bug fixes, typo corrections, and small refactors don't need specs. Use specs for new features, significant refactors, and architectural changes.

**Q: Can I skip phases?**
A: Phases are a guide, not a gate. For small features, you might write specs and implement in the same Claude Code session. The important thing is that specs exist before implementation starts.

**Q: What if the spec is wrong during implementation?**
A: Update the spec first, then implement. Specs are living documents. The important thing is that they stay in sync with the code.

**Q: Can I use Claude Code for implementation instead of Cursor?**
A: Yes. Claude Code can handle implementation, especially for complex backend logic. Cursor is recommended for rapid UI/frontend work and when Tab completion is valuable.

**Q: How does this relate to Plans.md?**
A: Plans.md tracks what you're doing today (session-level). Specs define what a feature is (feature-level). Use `/sdd-sync` to bridge them: it expands tasks.md into Plans.md with spec references.
