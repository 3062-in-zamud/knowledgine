export const REFERENCES: Record<string, string> = {
  "plugin-guide.md": `# Plugin Guide

Detailed documentation for each knowledgine ingest plugin.

---

## markdown

**Plugin ID**: \`markdown\`
**Source**: Local markdown files in the knowledge base directory

The default plugin used by \`knowledgine init\`. Scans the configured root directory
for \`.md\` files and indexes them.

\`\`\`bash
knowledgine ingest --source markdown --path ~/notes
\`\`\`

**What it captures**: Full text of markdown files, front matter metadata, headings,
code blocks.

**Incremental**: Yes. Tracks file modification times; re-ingests changed files only.

---

## git-history

**Plugin ID**: \`git-history\`
**Source**: Git repository commit history

Extracts knowledge from Git commit messages and associated diffs. Particularly useful
for understanding past design decisions and the evolution of specific files.

\`\`\`bash
knowledgine ingest --source git-history --path ~/project
\`\`\`

**What it captures**: Commit messages (especially conventional commit prefixes like
\`feat:\`, \`fix:\`, \`refactor:\`), file paths changed, commit metadata.

**Prerequisites**: Must be run inside a Git repository (or with \`--path\` pointing to one).

**Incremental**: Yes. Tracks the last processed commit hash.

**Tips**:
- Run with \`--full\` when first setting up to get the complete history
- Commit messages following Conventional Commits format produce higher-quality captures

---

## github

**Plugin ID**: \`github\`
**Source**: GitHub Pull Requests and Issues

Fetches PR descriptions, issue bodies, and comments from a GitHub repository.
Captures design discussions, bug reports, and decision rationale.

\`\`\`bash
GITHUB_TOKEN=<token> knowledgine ingest --source github --repo owner/repo --path ~/project
\`\`\`

**Prerequisites**:
- \`GITHUB_TOKEN\` environment variable with \`repo\` scope (or \`public_repo\` for public repos)
- \`--repo\` flag specifying the repository (format: \`owner/repo\`)

**What it captures**: PR titles and bodies, issue titles and bodies, labels.

**Rate limiting**: Uses authenticated requests; limit is 5000 requests/hour with a token.

**Incremental**: Yes. Tracks the last fetched item number.

---

## obsidian

**Plugin ID**: \`obsidian\`
**Source**: Obsidian vault markdown notes

Imports notes from an Obsidian vault, preserving internal links and tags.

\`\`\`bash
knowledgine ingest --source obsidian --path ~/vault
\`\`\`

**What it captures**: Note content, Obsidian tags (converted to knowledgine tags),
wikilinks, front matter.

**Prerequisites**: The Obsidian vault directory must be accessible. No special
configuration required — Obsidian stores notes as plain markdown.

**Tips**:
- Use \`--full\` after reorganizing your vault
- Notes with \`#private\` or \`#ignore\` tags can be excluded via plugin configuration

---

## claude-sessions

**Plugin ID**: \`claude-sessions\`
**Source**: Claude Code session history

Imports context from past Claude Code sessions stored in the session history.

\`\`\`bash
knowledgine ingest --source claude-sessions --path ~/project
\`\`\`

**What it captures**: Session summaries, key decisions and discoveries logged during
past Claude Code sessions.

**Storage location**: Claude Code stores session history in
\`~/.claude/projects/<project-hash>/\`.

---

## cursor-sessions

**Plugin ID**: \`cursor-sessions\`
**Source**: Cursor IDE session history

Imports knowledge from Cursor IDE's AI conversation history.

\`\`\`bash
knowledgine ingest --source cursor-sessions --path ~/project
\`\`\`

**What it captures**: Cursor AI conversation content that includes code decisions,
bug fixes, and architectural discussions.

**Storage location**: Cursor stores session data in its SQLite workspace database.

---

## cicd

**Plugin ID**: \`cicd\`
**Source**: CI/CD pipeline results (GitHub Actions)

Imports CI/CD pipeline outcomes, failed test results, and deployment records.

\`\`\`bash
GITHUB_TOKEN=<token> knowledgine ingest --source cicd --repo owner/repo --path ~/project
\`\`\`

**What it captures**: Workflow run summaries, failed job details, deployment events.

**Prerequisites**: \`GITHUB_TOKEN\` and \`--repo\` flag (same as github plugin).

**Use case**: Building knowledge about flaky tests, infrastructure issues, and
deployment patterns from CI history.
`,

  "source-types.md": `# Source Types and Configuration

Configuration requirements and environment variables for each ingest source.

---

## Configuration Summary

| Source | Required Config | Optional Config |
|--------|----------------|-----------------|
| \`markdown\` | \`--path\` (knowledge base dir) | — |
| \`git-history\` | \`--path\` (git repo dir) | \`--full\` to reset cursor |
| \`github\` | \`GITHUB_TOKEN\`, \`--repo\` | \`--full\` |
| \`obsidian\` | \`--path\` (vault dir) | \`--full\` |
| \`claude-sessions\` | \`--path\` | — |
| \`cursor-sessions\` | \`--path\` | — |
| \`cicd\` | \`GITHUB_TOKEN\`, \`--repo\` | \`--full\` |

---

## Environment Variables

### GITHUB_TOKEN

Required for \`github\` and \`cicd\` plugins.

\`\`\`bash
# Set in shell
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Or prefix the command
GITHUB_TOKEN=ghp_xxx knowledgine ingest --source github --repo owner/repo
\`\`\`

**Required scopes**:
- Public repos: \`public_repo\`
- Private repos: \`repo\`
- For CI/CD: add \`workflow\` scope

**Creating a token**:
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)

---

## Cursor State Management

Each plugin tracks a "cursor" — the last processed position — to enable incremental
ingestion. You can inspect cursor state and reset it:

\`\`\`bash
# View cursor state for all plugins
knowledgine plugins status --path ~/project

# Reset cursor to force full re-ingest
knowledgine ingest --source <plugin> --full --path ~/project
\`\`\`

---

## Running Multiple Plugins

\`\`\`bash
# Run all registered plugins sequentially
knowledgine ingest --all --path ~/project

# Check which plugins are registered
knowledgine plugins list
\`\`\`

---

## Troubleshooting

### "No plugin registered with ID: xxx"
The plugin is not registered. Check the plugin ID spelling against \`knowledgine plugins list\`.

### "GITHUB_TOKEN not set"
Set the \`GITHUB_TOKEN\` environment variable before running the github or cicd plugin.

### "Repository not found"
Verify the \`--repo\` flag uses \`owner/repo\` format and that your token has access to the repo.

### Ingest produced 0 notes
- Confirm the \`--path\` points to the correct directory
- For git-history: ensure the path contains a .git directory
- For obsidian: ensure the path contains .md files
- Try \`--full\` to reset the cursor and reprocess all content
`,
};
