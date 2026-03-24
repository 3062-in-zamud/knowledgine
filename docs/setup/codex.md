# Codex CLI Setup

Codex CLI is OpenAI's terminal-based AI coding agent. It reads MCP server configuration from `~/.codex/config.toml` and agent instructions from `~/.codex/AGENTS.md`.

## Config File Location

```
~/.codex/config.toml
```

## Automatic Setup (MCP)

```bash
knowledgine setup --target codex --path <dir> --write
```

This writes the MCP server entry into `~/.codex/config.toml`. Any existing MCP servers are preserved.

Then restart Codex CLI and run:

```bash
knowledgine status
```

## Manual Setup (config.toml)

Add the following block to `~/.codex/config.toml`:

```toml
[[mcpServers]]
name = "knowledgine"
command = "npx"
args = ["-y", "@knowledgine/cli", "start", "--path", "/absolute/path/to/your/knowledge-base"]
```

Replace the path with the directory you passed to `knowledgine init`.

## Adding Agent Instructions (AGENTS.md)

To give Codex CLI instructions on how to use knowledgine, append a section to `~/.codex/AGENTS.md`.

### Using the helper script

```bash
bash scripts/codex-integration.sh
```

Preview without writing:

```bash
bash scripts/codex-integration.sh --dry-run
```

### Manual append

Add the following to `~/.codex/AGENTS.md`:

````markdown
## knowledgine (Local Knowledge Base)

Search past problem-solving patterns and code patterns:

```bash
knowledgine recall "<search query>"
knowledgine suggest --context "<what you are working on>"
knowledgine tool search --query "<keyword>" --mode hybrid
```
````

REST API (if `knowledgine serve` is running):

```bash
curl "http://localhost:3456/search?q=<query>&mode=hybrid"
```

```

## Troubleshooting

**`config.toml` not found**
`knowledgine setup --write` creates the file and any missing parent directories automatically.

**Existing servers lost after write**
The setup command reports how many existing servers will be preserved (e.g., `5 other MCP server(s) will be preserved`). Run the preview command first to confirm.
```
