# Quick Start: Connecting knowledgine to Your AI Tools

Connect your local knowledge base to any supported AI coding assistant in under a minute.

## Prerequisites

- knowledgine installed: `npm install -g @knowledgine/cli`
- Knowledge base initialized: `knowledgine init --path <dir>`

## Supported Tools

| Tool           | Target name      | Config written to                                                                                               |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Claude Desktop | `claude-desktop` | `~/Library/Application Support/Claude/claude_desktop_config.json`                                               |
| Claude Code    | `claude-code`    | `~/.claude.json`                                                                                                |
| Cursor         | `cursor`         | `~/.cursor/mcp.json`                                                                                            |
| Windsurf       | `windsurf`       | `~/.codeium/windsurf/mcp_config.json`                                                                           |
| VS Code        | `vscode`         | `.vscode/mcp.json` (project-local)                                                                              |
| Zed            | `zed`            | `~/.config/zed/settings.json`                                                                                   |
| Cline          | `cline`          | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Codex CLI      | `codex`          | `~/.codex/config.toml`                                                                                          |
| GitHub Copilot | `github-copilot` | `~/.copilot/mcp-config.json`                                                                                    |
| Gemini CLI     | `gemini`         | `~/.gemini/settings.json`                                                                                       |
| OpenCode       | `opencode`       | `~/.config/opencode/config.json`                                                                                |
| Continue       | `continue`       | `~/.continue/config.json`                                                                                       |
| Antigravity    | `antigravity`    | `~/.antigravity/mcp.json`                                                                                       |

## Basic Setup

**Step 1: Preview the configuration**

```bash
knowledgine setup --target <tool> --path <dir>
```

**Step 2: Write the configuration**

```bash
knowledgine setup --target <tool> --path <dir> --write
```

**Step 3: Restart the tool, then verify**

```bash
knowledgine status
```

### Example

```bash
knowledgine init --path ~/notes
knowledgine setup --target claude-code --path ~/notes --write
# Restart Claude Code
knowledgine status
```

## Tool-Specific Guides

- [Cline](./cline.md)
- [Windsurf](./windsurf.md)
- [Codex CLI](./codex.md)
- [GitHub Copilot](./github-copilot.md)
