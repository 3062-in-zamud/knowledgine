# Cline Setup

Cline is an autonomous AI coding agent available as a VS Code extension (`saoudrizwan.claude-dev`).

## Config File Location

```
~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

## Automatic Setup

```bash
knowledgine setup --target cline --path <dir> --write
```

Then restart VS Code (or reload the Cline extension) and run:

```bash
knowledgine status
```

## Manual Setup

Open `cline_mcp_settings.json` and add the `knowledgine` entry under `mcpServers`:

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

**MCP server does not appear in Cline**
Reload the VS Code window (`Cmd+Shift+P` → "Developer: Reload Window") after writing the config.

**`npx` not found**
Cline inherits the shell PATH from VS Code's launch environment. Ensure Node.js is installed system-wide (not only via a version manager that activates in interactive shells). You can also replace `"command": "npx"` with the absolute path returned by `which npx`.

**Config file does not exist yet**
`knowledgine setup --write` creates the file automatically, including any missing parent directories.
