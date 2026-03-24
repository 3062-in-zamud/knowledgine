# GitHub Copilot Setup

GitHub Copilot supports MCP servers through the Copilot CLI and compatible editor extensions. The MCP configuration is read from `~/.copilot/mcp-config.json`.

## Config File Location

```
~/.copilot/mcp-config.json
```

## Automatic Setup

```bash
knowledgine setup --target github-copilot --path <dir> --write
```

Then restart the Copilot extension or CLI session and run:

```bash
knowledgine status
```

## Manual Setup

Open `~/.copilot/mcp-config.json` and add the `knowledgine` entry under `mcpServers`:

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

## Repository Instructions Template

For projects where you want Copilot to be aware of knowledgine, add a `copilot-instructions.md` file to the repository. A template is available at [`docs/templates/copilot-instructions.md`](../templates/copilot-instructions.md).

Copy it to your repository:

```bash
cp docs/templates/copilot-instructions.md .github/copilot-instructions.md
```

Then edit the REST API URL and search examples to match your project.

## Troubleshooting

**MCP server does not connect**
Confirm that `~/.copilot/mcp-config.json` is valid JSON. A syntax error will silently prevent all MCP servers from loading.

**`npx` not found**
Replace `"command": "npx"` with the absolute path returned by `which npx`.
