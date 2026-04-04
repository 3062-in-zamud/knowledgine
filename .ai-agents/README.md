# .ai-agents/ — SSOT for AI Agent Configuration

This directory is the **Single Source of Truth (SSOT)** for all AI agent skills, rules, and configuration used in this project.

## Why SSOT?

Multiple AI tools (Claude Code, Cursor, Codex) each have their own configuration directories. Instead of duplicating content across `.claude/skills/`, `.cursor/rules/`, etc., we keep the **actual files here** and use **symlinks** in tool-specific directories.

Benefits:

- One place to edit, all tools stay in sync
- No drift between tool configurations
- Easy to port to other projects (copy `.ai-agents/` + `AGENTS.md`)

## Directory Structure

```
.ai-agents/
├── README.md           ← You are here
├── skills/             ← Skill definitions (SKILL.md per skill)
│   ├── sdd-init/
│   ├── sdd-spec/
│   ├── sdd-analyze/
│   ├── sdd-implement/
│   ├── sdd-handoff/
│   ├── sdd-validate/
│   ├── sdd-review/
│   ├── sdd-close/
│   ├── sdd-status/
│   └── sdd-sync/
├── rules/              ← Rule files shared across tools
│   └── sdd-workflow.md
└── config/             ← Shared configuration and checklists
    └── review-checklist.md
```

## Symlink Convention

### Claude Code Skills

```bash
# From repo root:
ln -s ../../.ai-agents/skills/sdd-init .claude/skills/sdd-init
```

Pattern: `.claude/skills/{name}` -> `../../.ai-agents/skills/{name}`

### Cursor Rules

```bash
# From repo root:
ln -s ../../.ai-agents/rules/sdd-workflow.md .cursor/rules/sdd-workflow.md
```

Pattern: `.cursor/rules/{file}` -> `../../.ai-agents/rules/{file}`

### Codex

Codex reads `AGENTS.md` directly from the repo root. No symlinks needed.

## Adding a New Skill

1. Create a directory: `.ai-agents/skills/{skill-name}/`
2. Write `SKILL.md` following the existing format (see any `sdd-*` skill for reference)
3. Create symlink: `ln -s ../../.ai-agents/skills/{skill-name} .claude/skills/{skill-name}`
4. If the skill should also be a Cursor rule, create a rule file in `.ai-agents/rules/` and symlink to `.cursor/rules/`
5. Commit both the actual file and the symlink

## Tool-Specific Reference

| Tool        | Reads from                  | Mechanism                       |
| ----------- | --------------------------- | ------------------------------- |
| Claude Code | `.claude/skills/`           | Symlink -> `.ai-agents/skills/` |
| Cursor      | `.cursor/rules/`            | Symlink -> `.ai-agents/rules/`  |
| Codex       | `AGENTS.md` (root)          | Direct read, no symlink         |
| All tools   | `specs/`, `docs/workflows/` | Direct read                     |

## Git Management

- `.ai-agents/` is committed to the repo (it IS the source of truth)
- Symlinks in `.claude/skills/` and `.cursor/rules/` are also committed
- Git preserves symlinks on clone (works on macOS/Linux; Windows may need `git config core.symlinks true`)
