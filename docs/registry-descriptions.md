# Knowledgine — MCP Registry Descriptions

Prepared descriptions for MCP Registry and aggregator submissions.

## Tagline

Extract structured knowledge from markdown notes for AI coding tools

## Short Description

Knowledgine indexes your markdown documentation and notes, then exposes them as MCP tools for AI coding assistants. It provides full-text search across your knowledge base, extracts reusable patterns from your notes, and manages persistent memory for AI sessions.

## Full Description

Knowledgine is a developer knowledge infrastructure tool that bridges your personal markdown notes and AI coding assistants through the Model Context Protocol (MCP).

### Features

- **Full-Text Search** — FTS5-powered search across all indexed markdown files with relevance ranking and context snippets
- **Pattern Extraction** — Automatically identifies and retrieves recurring patterns (code snippets, solutions, conventions) from your notes
- **Memory Management** — Persistent key-value memory store for AI sessions, enabling continuity across conversations
- **Watch Mode** — Automatically re-indexes files as you write, keeping the knowledge base up to date
- **Incremental Indexing** — Only reprocesses changed files for fast startup and low resource usage

### Supported MCP Tools

| Tool               | Description                                        |
| ------------------ | -------------------------------------------------- |
| `search_knowledge` | Full-text search across indexed markdown files     |
| `get_patterns`     | Retrieve extracted patterns by category or keyword |
| `read_memory`      | Read a persistent memory value by key              |
| `write_memory`     | Write a persistent memory value                    |
| `list_memories`    | List all stored memory keys                        |

### How It Works

1. Point Knowledgine at a directory containing your markdown files
2. It indexes all content into a local SQLite database with FTS5
3. Connect your AI coding tool (Cursor, Claude Code, etc.) via MCP stdio transport
4. The AI can now search your knowledge base and access your accumulated patterns

### Installation

```bash
npx @knowledgine/cli init
npx @knowledgine/cli serve --watch
```

## Tags

`mcp`, `knowledge-management`, `markdown`, `full-text-search`, `pattern-extraction`, `developer-tools`
