# Windsurf Setup

Windsurf is an AI-first code editor by Codeium with built-in MCP support.

## Config File Location

```
~/.codeium/windsurf/mcp_config.json
```

## Automatic Setup

```bash
knowledgine setup --target windsurf --path <dir> --write
```

Then restart Windsurf and run:

```bash
knowledgine status
```

## Manual Setup

Open `~/.codeium/windsurf/mcp_config.json` and add the `knowledgine` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "npx",
      "args": ["-y", "@knowledgine/cli", "start", "--path", "/absolute/path/to/your/knowledge-base"]
    }
  }
}
```

Replace `/absolute/path/to/your/knowledge-base` with the directory you passed to `knowledgine init`.

## Troubleshooting

**MCP server does not appear after restart**
Check that the config file path is exactly `~/.codeium/windsurf/mcp_config.json`. Windsurf does not read alternative locations.

**`npx` not found**
Windsurf may launch with a restricted PATH. Replace `"command": "npx"` with the absolute path returned by `which npx`, for example `/usr/local/bin/npx`.

**Existing servers disappear after `--write`**
`knowledgine setup --write` merges the new entry into the existing config; it does not overwrite the entire file. If servers went missing, run the preview command first (`knowledgine setup --target windsurf --path <dir>`) to inspect what would be written.
