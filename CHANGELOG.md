# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.0.1] - 2026-03-19

### Added

#### Core (`@knowledgine/core`)

- Knowledge extraction engine for markdown files
- Pattern detection: problem, solution, learning, time-based patterns
- Three-tier memory system (episodic -> semantic -> procedural promotion)
- FTS5 full-text search with Japanese content support
- Problem-solution pair detection
- Rule-based classification with context-aware confidence scoring
- YAML frontmatter extraction
- Code block detection and exclusion from pattern extraction

#### MCP Server (`@knowledgine/mcp-server`)

- `search_knowledge` tool: Full-text search with FTS5
- `find_related` tool: Related note discovery (tag similarity, title similarity, time proximity, problem-solution pairs)
- `get_stats` tool: Knowledge base statistics
- Environment variable configuration support

#### CLI (`@knowledgine/cli`)

- `init` command: Batch indexing of markdown files
- `start` command: MCP server with real-time file watching
- Configurable watch patterns and ignore patterns
- Graceful shutdown handling (SIGINT/SIGTERM)

[0.0.1]: https://github.com/3062-in-zamud/knowledgine/releases/tag/v0.0.1
