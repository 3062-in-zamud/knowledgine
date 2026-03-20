# knowledgine

Developer Knowledge Infrastructure — extract structured knowledge from your markdown notes for AI coding tools.

[日本語](./docs/README.ja.md)

![CI](https://github.com/3062-in-zamud/knowledgine/actions/workflows/ci.yml/badge.svg)
[![npm](https://img.shields.io/npm/v/@knowledgine/cli)](https://www.npmjs.com/package/@knowledgine/cli)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

---

## Why knowledgine?

Developers accumulate valuable knowledge in markdown notes — debugging sessions, architectural decisions, problem-solution pairs, and hard-won lessons. That knowledge stays siloed in files, invisible to AI coding assistants.

knowledgine bridges that gap. It scans your markdown files, detects patterns (problem-solution pairs, code snippets, learnings), and stores them in a local SQLite database with FTS5 full-text search. An MCP server exposes that knowledge to any MCP-compatible AI tool, so your assistant can retrieve the right context exactly when you need it.

---

## Quick Start

Five minutes from install to working MCP integration.

### 1. Install

```bash
npm install -g @knowledgine/cli
```

### 2. Index your notes

```bash
knowledgine init --path ./my-notes
```

This scans all markdown files under `./my-notes` and builds `.knowledgine/index.sqlite`.

### 3. Start the MCP server

```bash
knowledgine start --path ./my-notes
```

### 4. Connect your AI tool

Add the following to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "npx",
      "args": ["-y", "@knowledgine/cli", "start", "--path", "/path/to/notes"]
    }
  }
}
```

---

## MCP Tools

Once connected, the following tools are available to your AI assistant.

| Tool               | Description                                                                                              | Key Parameters                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `search_knowledge` | Full-text search across all indexed notes using FTS5                                                     | `query` (string, required), `limit` (number, optional, default 10) |
| `find_related`     | Find notes related to a given note by tags, title similarity, time proximity, and problem-solution pairs | `notePath` (string, required), `strategies` (array, optional)      |
| `get_stats`        | Retrieve knowledge base statistics (total notes, indexed size, last updated)                             | —                                                                  |

---

## MCP Client Setup

### Claude Code

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `~/.config/claude/claude_desktop_config.json` (Linux):

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "npx",
      "args": ["-y", "@knowledgine/cli", "start", "--path", "/path/to/notes"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root (recommended) or `~/.cursor/mcp.json` for global use.

Using `${workspaceFolder}` to automatically point to the current project:

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "npx",
      "args": ["@knowledgine/cli", "start"],
      "env": {
        "KNOWLEDGINE_ROOT_PATH": "${workspaceFolder}"
      }
    }
  }
}
```

For detailed setup instructions, variable expansion reference, and troubleshooting, see the [Cursor Setup Guide](./docs/cursor-setup.md).

---

## Architecture

```
@knowledgine/cli
├── @knowledgine/mcp-server
│   └── @knowledgine/core
└── @knowledgine/core
```

| Package                   | Description                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@knowledgine/core`       | Knowledge extraction engine. Detects patterns in markdown (problem-solution pairs, code blocks, tags), manages the 3-tier memory model, and provides FTS5 search via SQLite. |
| `@knowledgine/mcp-server` | MCP server that exposes `search_knowledge`, `find_related`, and `get_stats` tools to MCP-compatible AI clients.                                                              |
| `@knowledgine/cli`        | Command-line interface. `init` runs a batch index of your notes; `start` launches the MCP server with a file watcher for incremental updates.                                |

---

## Configuration

knowledgine uses sensible defaults. You can override them by passing options to `init` or `start`, or by editing the generated config.

| Field            | Default               | Description                                                       |
| ---------------- | --------------------- | ----------------------------------------------------------------- |
| `dataDir`        | `.knowledgine`        | Directory where the SQLite index is stored, relative to `--path`. |
| `watchPatterns`  | `["**/*.md"]`         | Glob patterns for files to index and watch.                       |
| `ignorePatterns` | `["node_modules/**"]` | Glob patterns for files to exclude.                               |

---

## Prerequisites

- **Node.js** >= 18.17.0
- **pnpm** >= 9 (for contributing / local builds)
- **Native build tools** for `better-sqlite3`:
  - macOS: `xcode-select --install`
  - Linux (Ubuntu/Debian): `sudo apt-get install build-essential python3`
  - Windows: `npm install --global windows-build-tools`

---

## Feedback

We'd love to hear from you:

- **Bug reports**: [Open an issue](https://github.com/3062-in-zamud/knowledgine/issues/new?template=bug_report.yml)
- **Feature requests**: [Open an issue](https://github.com/3062-in-zamud/knowledgine/issues/new?template=feature_request.yml)
- **Questions & discussions**: [GitHub Discussions](https://github.com/3062-in-zamud/knowledgine/discussions)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, commit conventions, and pull request guidelines.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
