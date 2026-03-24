export const SKILL_MD = `---
name: knowledgine-ingest
description: >
  Import knowledge from external sources into the local knowledge base. Invoke when
  the user wants to import from Git commit history, GitHub PRs and issues, Obsidian
  vaults, Claude or Cursor session histories, or CI/CD pipelines. Each source requires
  a specific plugin and configuration.
---
# knowledgine-ingest

## Purpose

Populate the knowledge base from external knowledge repositories — version control
history, issue trackers, personal note systems, AI session logs — without manual
capture. Ingestion enriches the knowledge base with historical context that predates
the current session.

## When to Use

- **Onboarding to a codebase** — Ingest Git history to capture past decisions
- **Integrating GitHub knowledge** — Import PRs and issues for context
- **Importing Obsidian notes** — Bring personal or team notes into the knowledge base
- **Capturing AI session history** — Import Claude or Cursor session logs
- **Building CI knowledge** — Import CI/CD pipeline outcomes and patterns
- **User explicitly requests import** — "Load my notes from Obsidian"

## When NOT to Use

- When the source has already been fully ingested in this session (check cursor state)
- When the user has not configured the required credentials (e.g., GITHUB_TOKEN)

## How to Ingest (CLI)

\`\`\`bash
# Run a specific plugin
knowledgine ingest --source <plugin-id> --path <knowledge-base-path>

# Run all registered plugins
knowledgine ingest --all --path <knowledge-base-path>

# Force full re-ingest (ignore stored cursor)
knowledgine ingest --source <plugin-id> --full --path <knowledge-base-path>

# GitHub-specific (requires GITHUB_TOKEN env var)
knowledgine ingest --source github --repo owner/repo --path <path>
\`\`\`

## Available Source Plugins

| Plugin ID | Source | Notes |
|-----------|--------|-------|
| \`markdown\` | Local markdown files | Default; used by \`knowledgine init\` |
| \`git-history\` | Git commit messages and diffs | Extracts decisions from commit history |
| \`github\` | GitHub PRs and issues | Requires \`GITHUB_TOKEN\` env var |
| \`obsidian\` | Obsidian vault notes | Reads from configured vault path |
| \`claude-sessions\` | Claude Code session logs | Imports past AI session context |
| \`cursor-sessions\` | Cursor IDE session history | Imports Cursor session context |
| \`cicd\` | CI/CD pipeline results | GitHub Actions, build outcomes |

## Step-by-Step Instructions

1. **Identify the source** — Which external system contains the knowledge to import?
2. **Check prerequisites** — Does the plugin need credentials or configuration? (see plugin-guide.md)
3. **Run the ingest command** — Use the appropriate plugin ID and options
4. **Verify results** — Run \`knowledgine status\` or search to confirm notes were imported
5. **Re-ingest if needed** — Use \`--full\` flag to re-process already-seen content

## Best Practices

- Run \`git-history\` ingest when starting work on a new repository
- Set \`GITHUB_TOKEN\` before ingesting GitHub content to avoid rate limiting
- Use \`--full\` flag after changing ingest configuration
- Check \`knowledgine plugins status\` to see the last ingest cursor for each plugin

## Reference Files

- See \`plugin-guide.md\` for detailed documentation on each plugin
- See \`source-types.md\` for configuration requirements for each source type
`;
