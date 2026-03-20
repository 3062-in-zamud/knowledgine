# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-03-20

### Changed

- **BREAKING**: Semantic search is now opt-in (FTS5 full-text search is the default)
  - `embedding.enabled` defaults to `false` in config
  - `onnxruntime-node` and `sqlite-vec` moved to `optionalDependencies`
  - Use `knowledgine init --semantic` or `knowledgine upgrade --semantic` to enable
- **MCP Server**: `createKnowledgineMcpServer` now takes an options object instead of positional arguments
- **MCP Server**: `initializeDependencies` is now async (returns `Promise`)
- **MCP Server**: Server version now uses the package VERSION instead of hardcoded "0.0.1"

### Added

- `loadConfig()` — RC file-based configuration loader (`.knowledginerc.json` / `.knowledginerc.yml`)
- `writeRcConfig()` — Write `.knowledginerc.json` for persisting settings
- `loadSqliteVecExtension()` — Async sqlite-vec extension loader
- `KNOWLEDGINE_SEMANTIC` environment variable to enable semantic search
- `knowledgine upgrade --semantic` CLI command for post-init semantic search enablement
- `--semantic` flag on `knowledgine init` for opt-in semantic search during initialization
- Automatic model detection for backward compatibility (existing installs with model auto-enable semantic)
- Graceful fallback from semantic/hybrid to keyword search with informative matchReason
- Search mode display in `knowledgine status` output

### Deprecated

- `--skip-embeddings` flag on `knowledgine init` (embeddings are now opt-in by default)

## [0.1.0] - 2026-03-20

### Added

#### Core (`@knowledgine/core`)

- **Knowledge Graph**: Entity-Relation-Observation model for structured knowledge representation
  - Entity creation, relation management, and observation tracking
  - Graph traversal and querying capabilities
- **Semantic Search**: Vector similarity search powered by SQLite-vec and ONNX Runtime
  - Embedding generation with all-MiniLM-L6-v2 model
  - Hybrid search combining FTS5 full-text and vector similarity

#### Documentation

- Cursor MCP setup guide with step-by-step instructions
- Troubleshooting guide for common MCP integration issues

#### Infrastructure

- MCP directory registration materials (server.json, descriptions)

### Fixed

- Integration issues from parallel agent work resolved

[0.2.0]: https://github.com/3062-in-zamud/knowledgine/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/3062-in-zamud/knowledgine/compare/v0.0.1...v0.1.0

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
