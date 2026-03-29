# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

#### MCP Memory Protocol (`@knowledgine/mcp-memory-protocol`)

- **Error format conformance suite** (`runErrorFormatTests`): エラーレスポンスが `{ isError: true, content: [{ type: "text", text: "CODE: ..." }] }` 形式であることを検証する conformance test suite を追加（KNOW-340）
- **Capabilities conformance suite** (`runCapabilitiesTests`): `get_memory_capabilities` ツールが有効な `MemoryProviderCapabilities` 構造を返すことを検証する conformance test suite を追加（optional, KNOW-340）
- **`npm` 公開準備**: `prepublishOnly` スクリプトと `@modelcontextprotocol/sdk` の peerDependency を追加（KNOW-340）

#### MCP Server (`@knowledgine/mcp-server`)

- **`get_memory_capabilities` ツール**: `MemoryProvider.capabilities()` の結果を返す MCP ツールを追加（KNOW-340）

### Fixed

#### MCP Server (`@knowledgine/mcp-server`)

- **`GraphRepositoryImpl` 参照エラー修正**: `rest-server.ts` で存在しない `GraphRepositoryImpl` を参照していたビルドエラーを修正。`GraphRepository` クラスを直接使用するよう変更（KNOW-340）

### Documentation

- **MCP Memory Protocol SEP draft 最終仕上げ**: 参照実装リンク・`get_memory_capabilities` capabilities 記述を更新（KNOW-341）

- **`docs/mcp-memory-protocol-proposal/implementation-guide.md`** 新規作成: `MemoryProvider` インターフェース実装方法、Zodスキーマを使ったツール登録、エラーハンドリング、conformance suite の実行方法（KNOW-340）
- **`docs/mcp-memory-protocol-proposal/conformance-suite.md`** コード不整合修正: `ConformanceAdapter` → 実際の `ConformanceTestContext` インターフェース、API使用例を実際のエクスポートに合わせて修正（KNOW-340）
- **`docs/mcp-memory-protocol-proposal/reference-impl.md`** 虚偽記述修正: `temporal_query`・`semantic_search`・`ttl` を "Implemented" → "Planned" に修正。ファイル構造と型名を実際のコードに合わせて修正（KNOW-340）

#### Core (`@knowledgine/core`)

- **クロスプロジェクト横断検索 (`CrossProjectSearcher`)**: 複数プロジェクトの SQLite DB を read-only で横断検索する `CrossProjectSearcher` クラスを追加。スキーマバージョン 8 未満の DB は自動スキップ、DB 接続を try/finally で確実にクローズ、最大 10 プロジェクトまで同時検索をサポート（KNOW-338）
- **RcConfig拡張 + Zodバリデーション**: `serve.authToken`、`noise`、`observer`、`projects` フィールドをRcConfigに追加。Zodスキーマによるランタイムバリデーションを実装し、不正な設定値はデフォルトにフォールバック + 警告ログを出力
- **Migration 013 — `unknown` entityタイプ追加**: `entities` テーブルのCHECK制約に `'unknown'` を追加（SQLiteのALTER COLUMN非サポートによりテーブル再作成）（KNOW-362）
- **entityタイプ推定の保守化**: `@mention` のフォールバック分類を `person` → `unknown` に変更。TECH_DICTIONARY に `vscode`・`neovim` を追加、NOT_PERSON_LISTに `linter`・`formatter`・`bundler`・`transpiler` を追加（KNOW-362）
- **`searchEntities` に `includeUnknown` オプション追加**: デフォルト `false` で `entity_type='unknown'` を検索結果から除外（KNOW-362）
- **`loadRcFile` を公開 API に追加**: `loadRcFile(startDir)` を `@knowledgine/core` からエクスポート。CLI コマンドが rc ファイルの設定値を直接参照できるように（KNOW-323）

#### MCP Server (`@knowledgine/mcp-server`)

- **`search_knowledge` に `projects` パラメータ追加**: クロスプロジェクト検索を MCP ツールから実行可能に。`projects: string[]` でプロジェクト名を指定すると `CrossProjectSearcher` を使用（KNOW-338）
- **REST `/search` に `projects` クエリパラメータ追加**: `GET /search?q=...&projects=a,b` でカンマ区切りプロジェクト名を指定してクロスプロジェクト検索（KNOW-338）

#### Ingest (`@knowledgine/ingest`)

- **NoiseFilter設定可能化**: `NoiseFilter` クラスを追加。`shortMessageThreshold`、`botAuthors`、`noiseSubjectPatterns`、`excludePatterns` を設定可能に。既存の関数エクスポート（`classifyNoiseLevel` 等）は後方互換を維持。
- **entity抽出をIngestEngineパイプラインに統合**: `IngestEngine` のコンストラクタにオプショナルな `graphRepository` パラメータを追加。`graphRepository` が提供された場合、ingest完了後に `IncrementalExtractor` を自動実行する。`IngestSummary` に `extractionSummary` フィールドを追加。`ingest()` のオプションに `postProcessExtraction` (default: true) を追加し、抽出をスキップ可能に（KNOW-324）

#### CLI (`@knowledgine/cli`)

- **`--exclude-pattern` オプション**: `knowledgine ingest` コマンドに `--exclude-pattern <patterns...>` オプションを追加。Globパターンでパスをフィルタできる（例: `**/vendor/**`）。
- **`--observe` / `--no-observe` / `--observe-limit` オプション**: `knowledgine ingest` コマンドに Observer/Reflector エージェントのオプトイン切り替えを追加。`--observe` フラグまたは `.knowledginerc.json` の `observer.enabled: true` で有効化。LLM 未設定時はルールベースモードで動作（KNOW-323）
- **`--skip-extraction` オプション**: `knowledgine ingest` コマンドに `--skip-extraction` オプションを追加。ingest後のentity抽出をスキップできる（KNOW-324）

#### MCP Server (`@knowledgine/mcp-server`)

- **`POST /capture` エンドポイント**: Bearer token認証付きのRESTエンドポイントを追加。AIツール（Cline, Windsurf, Cursor等）からのプッシュ型セッションキャプチャを実現。`KNOWLEDGINE_API_TOKEN` 環境変数または `.knowledginerc.json` の `serve.authToken` でトークン設定。timing-safe比較（`crypto.timingSafeEqual`）、Zodバリデーション、100,000文字上限を実装（KNOW-310）
- **`CaptureOptions` 型エクスポート**: `createRestApp` の第3引数として `CaptureOptions` を追加。`authToken` 未設定時はエンドポイントが無効になり後方互換を維持

#### CLI (`@knowledgine/cli`)

- **`knowledgine serve` — capture機能統合**: `KNOWLEDGINE_API_TOKEN` 環境変数または `rcConfig.serve.authToken` を読み込み、設定時は `POST /capture` を自動的に有効化（KNOW-310）

### Removed

#### CLI (`@knowledgine/cli`)

- **`packages/cli/src/lib/entity-extractor.ts` 削除**: `postIngestProcessing` を提供していたdeprecatedファイルを削除。`init` コマンドは `IncrementalExtractor` を直接使用するよう移行（KNOW-324）

## [0.5.0] - 2026-03-28

### Added

#### Core (`@knowledgine/core`)

- **CJK検索サポート**: 中国語・日本語・韓国語テキスト向けに dual FTS テーブル構成を採用（KNOW-366）
- **`--related` エンティティ名指定**: ファイルパスに加えエンティティ名文字列でも `--related` クエリを実行可能に（KNOW-357）

#### CLI (`@knowledgine/cli`)

- **status コマンド ソース別内訳**: `knowledgine status` にソース（git-history / GitHub / markdown 等）別のノート件数を表示（KNOW-363）
- **init 時の ingest ヒント表示**: markdown ファイルが見つからない場合に適切なデータソースを案内（KNOW-367）
- **init 時のセマンティック検索自動有効化**: ONNX モデルが利用可能な場合、init 時に自動でセマンティック検索を有効化（KNOW-356）

#### Ingest (`@knowledgine/ingest`)

- **スキップ理由の表示**: 処理件数が 0 件の場合にスキップ理由を明示（KNOW-358）
- **ノイズ削減**: i18n ファイル、Dependabot コミット、短すぎるメッセージを自動フィルタ（KNOW-359）
- **進捗表示**: GitHub および git-history プラグインでの取り込み進捗をリアルタイム表示（KNOW-353）
- **git-history コミット上限の設定化**: `--limit` オプションで取得するコミット数を制限可能に（KNOW-352）

### Changed

#### Core (`@knowledgine/core`)

- **プリペアドステートメントキャッシュ**: 繰り返し実行されるクエリを `stmt()` ヘルパーでキャッシュし、3.7x のクエリ速度向上（perf）
- **N+1 クエリ排除**: content projection とバッチフェッチにより、検索結果取得時の N+1 問題を解消（perf）
- **embedding pipeline 最適化**: バッチ処理パイプラインを最適化し、embedding 生成スループットを改善（perf）

### Fixed

#### Core (`@knowledgine/core`)

- **`--related` スコアリング修正**: スコア飽和と時間近接バイアスを修正し、より精度の高い関連ノード検索を実現（KNOW-351, KNOW-364）
- **URL パスフラグメントのエンティティ抽出除外**: URL のパス部分が誤ってエンティティとして抽出される問題を修正（KNOW-361）
- **CHANGELOG 長さバイアス補正**: オーケストレーター検索パスでの長さによるスコアバイアスを修正（KNOW-354）
- **migration012 の公開**: `@knowledgine/core` のエクスポートに migration012 を追加（他 migration との整合性）

#### CLI (`@knowledgine/cli`)

- **セマンティック検索の準備状態チェック統一**: 全コマンドで一貫したセマンティック検索の利用可否判定を実施（KNOW-346）
- **serve コマンドの sqlite-vec ロード修正**: セマンティック検索の自動検出時に sqlite-vec 拡張を正しくロードするよう修正（KNOW-355）
- **embedding provider の受け渡し修正**: serve コマンドが embedding provider を正しく引き渡すよう修正（KNOW-355）
- **init 時の暗黙的な `.knowledginerc.json` 生成を停止**: 意図しない設定ファイルの自動生成を廃止（KNOW-360）
- **EMFILE エラー処理と watch 除外パターンの改善**: ファイルディスクリプタ枯渇時の挙動とファイル監視の除外設定を改善（KNOW-347）
- **embedding と noteId の不一致修正**: バッチ処理パイプラインで embedding と対応するノート ID のズレを修正

#### Ingest (`@knowledgine/ingest`)

- **GitHub ページネーション完全実装**: 1000 件の上限を撤廃し全件取得を実現（KNOW-349）
- **同一タイムスタンプでの無限ループ防止**: ページネーション時の stall guard を追加（KNOW-349）
- **エラー件数の正確なカウント**: maxBuffer スキップを含むエラーを正しく計上（KNOW-350）
- **heap 監視と OOM 防止**: 全プラグインに heap 使用量監視と OOM 予防処理を追加（KNOW-348）
- **markdown バッチ処理**: 大規模リポジトリでの OOM を防ぐため markdown 処理をバッチ化（KNOW-365）
- **quiet オプションの実装**: stderr 出力を抑制する `--quiet` オプションを追加

## [0.4.1] - 2026-03-27

### Changed

#### CI/CD

- **GitHub Actions**: Updated actions/checkout v4 → v6, actions/setup-node v4 → v6, pnpm/action-setup v4 → v5, github/codeql-action v3 → v4, actions/labeler v5 → v6

#### Dependencies

- **eslint**: 9.x → 10.1.0 (flat config fully compatible)
- **lint-staged**: 15.x → 16.4.0
- **onnxruntime-node**: 1.20.1 → 1.24.3

### Fixed

#### Security

- **ReDoS prevention**: Replaced combined import regex with separate `\bfrom\b`/`\brequire\b` patterns in entity-extractor; bounded numeric quantifiers (`\d+` → `\d{1,N}`) in query-classifier temporal/factual patterns
- **TOCTOU elimination**: Replaced `existsSync` + `writeFileSync` with atomic `wx` flag in dataset downloader
- **Dependency security**: Updated `yaml` to 2.8.3 and `smol-toml` to 1.6.1 for security fixes

#### Core (`@knowledgine/core`)

- **Markdown heading title parsing**: Preserve heading titles correctly during file processing
- **Code scanning alerts**: Resolved static analysis findings in CLI commands and core utilities (atomic write helper, file-utils refactor)

## [0.4.0] - 2026-03-26

### Added

#### Core (`@knowledgine/core`)

- **Version Fields on KnowledgeNote**: `version`, `supersededBy`, and `deprecatedAt` fields added to `KnowledgeNote` type with deprecation API support
- **Observer Agent**: 6-vector classification system for automatic knowledge observation and categorization
- **Reflector Agent**: Contradiction detection and knowledge validation across stored notes
- **Unified Query Orchestrator**: 3-layer search integration combining vector, graph, and agentic retrieval
- **Query Classifier**: Intent-based query routing to the appropriate search layer
- **Temporal Query Engine**: Point-in-time queries and version chain navigation with time-travel support
- **LongMemEval Benchmark Infrastructure**: Complete benchmark suite (adapter, evaluator, runner, reporter) with 73.2% task-averaged accuracy
- **LongMemEval Search Improvements**: ISO 8601 date normalization, preference keyword expansion, multi-session top-3 synthesis, SQL-level temporal filtering
- **MCP Memory Protocol**: Migration 010 adds memory protocol schema; `@knowledgine/mcp-memory-protocol` package with Zod schemas, conformance test suite, and provider interface

#### MCP Server (`@knowledgine/mcp-server`)

- **MCP Memory Protocol tools**: `memory_store`, `memory_recall`, `memory_update`, `memory_forget` tools implementing the MCP Memory Protocol specification
- **Memory adapter**: Bridge layer translating MCP Memory Protocol operations to Knowledgine's internal storage

#### Documentation

- LongMemEval benchmark results (73.2% accuracy, competitive with Zep 71% and Mem0 49%)
- MCP Memory Protocol proposal: SEP draft, conformance suite spec, reference implementation guide, and feedback plan
- Japanese blog post announcing LongMemEval benchmark achievement

## [0.3.0] - 2026-03-24

### Added

#### Core (`@knowledgine/core`)

- **Incremental Extraction**: `IncrementalExtractor` for running pattern/entity/relation extraction on specific notes instead of all notes — enables extraction on all ingest sources
- **Causal Link Detection**: `CausalLinkDetector` automatically links related events (session→commit, commit→PR, review→fix-commit) using timestamp proximity and branch matching
- **Knowledge Versioning Schema**: Migration 008 adds version tracking, supersedes chains, and deprecation support for knowledge notes
- **Extraction Metadata Schema**: Migration 009 adds `code_location_json`, `extracted_at` columns and `suggest_feedback` table
- **LLM Provider Abstraction**: Pluggable LLM providers (OpenAI, Ollama) with exponential backoff retry and 7 error code taxonomy
- **Reasoning Reranker**: 3-axis scoring (temporal, context relevance, PSP quality) for agentic search with graceful LLM degradation

#### CLI (`@knowledgine/cli`)

- **`suggest --diff`**: Check git diffs against past review patterns before creating PRs — proactive issue prevention
- **`suggest --file` improvement**: Smart content extraction (2000 chars) replacing the previous 200-char limit
- **`feedback-suggest` command**: Collect usefulness feedback on suggest results for future accuracy improvement
- **Diff parser**: Unified diff parser with binary skip, rename support, and 50-file limit
- **Pre-push hook template**: `scripts/knowledgine-pre-push.template` for git integration (advisory only, 10s timeout)

#### Ingest (`@knowledgine/ingest`)

- **Assistant response saving**: Claude session notes now include assistant responses with role markers (`### User:` / `### Assistant:`)
- **Decision detection**: Important assistant messages (design decisions, tradeoffs, rationale) preserved at 500 chars; general responses at 200 chars (JP/EN pattern matching)
- **PR review code positions**: Inline review comments from `gh api pulls/{n}/comments` now store file path, line number, and diff hunk in `code_location_json`
- **Auto-extraction on all sources**: Pattern/entity extraction now runs after every ingest and capture, not just `init`

#### MCP Server (`@knowledgine/mcp-server`)

- Auto-extraction on `capture_knowledge` tool — patterns and entities extracted immediately after capture
- Agentic retrieval integration with `--agentic` flag for deprecated note inclusion and LLM reranking

#### Documentation

- Project logo and icon assets

### Changed

- `postIngestProcessing()` now delegates to `IncrementalExtractor` (backward compatible)
- `EventWriter.writeBatch()` returns `noteIds` array for downstream extraction
- `IngestSummary` type extended with optional `noteIds` field
- `explain --timeline` displays causal links with arrow notation
- Claude session section header changed from `## User Messages` to `## Session Messages`
- `recall` command supports `--agentic` flag for deprecated note inclusion

## [0.2.3] - 2026-03-24

### Added

#### CLI (`@knowledgine/cli`)

- **Agent Skills Setup**: `knowledgine setup --rules --skills` for interactive 3-step agent configuration (MCP → Rules → Skills) across 13 AI agent platforms
- Rule templates for 12 agents: Claude Code, Cursor, Cline, Codex, Continue, Gemini, GitHub Copilot, OpenCode, Windsurf, Zed, Antigravity
- 7 MECE skill packages: capture, recall, suggest, explain, debrief, ingest, feedback — covering the full knowledge lifecycle
- `suggest` command: contextual knowledge suggestions based on current work context
- `explain` command: entity explanation with knowledge graph navigation
- `recall` command: search the knowledge base with YAML format support
- `serve` command: REST API server for HTTP-based integrations
- Hierarchical `.knowledginerc` discovery with enhanced DX
- E2E test suite for full workflow and REST API smoke tests

#### Ingest (`@knowledgine/ingest`)

- **Cursor IDE Sessions** plugin: ingest Cursor session history
- **GitHub Actions CI/CD** plugin: ingest workflow runs, failures, and deployment events
- PR comment/review ingestion and rate limit detection for GitHub plugin

#### Core (`@knowledgine/core`)

- Bi-temporal schema alignment and provenance spec conformance (migration 007)
- Entity extractor enhancements for knowledge graph

#### MCP Server (`@knowledgine/mcp-server`)

- REST API server (`rest-server.ts`) for non-MCP HTTP access

#### Documentation

- Multi-agent setup guides for Cline, Codex, GitHub Copilot, Windsurf
- Quick-start guide for new users

#### Infrastructure

- Release PR template for standardized release process

### Fixed

- **Security**: Apply `sanitizeContent` to claude-sessions plugin
- Drop `vec0` triggers when sqlite-vec is not loaded
- Add `obsidian://` URI scheme to Obsidian plugin `sourceUri`

### Changed

- Align git-history plugin `eventType`, `sourceUri`, and log format to spec
- Batch improvements across CLI, core, and ingest packages

## [0.2.2] - 2026-03-23

### Added

- **Branching strategy**: develop/main branching model with automated releases on main merge
- Husky + lint-staged pre-commit quality checks
- CI concurrency control to cancel duplicate runs

### Changed

- Replace tag-based `publish.yml` with main-merge-triggered `release.yml` (auto git tag, npm publish, GitHub Release)
- Dependabot now targets `develop` branch
- Drop Node 18 from CI matrix (EOL, `string-width` v8 incompatible)
- Scope security audit to production dependencies only
- Fix duplicate `engines` field in root `package.json`
- Code formatting unification across CLI commands and README
- Update `CONTRIBUTING.md` with new branch strategy and release process

### Fixed

- Remove unused imports to pass lint

## [0.2.1] - 2026-03-23

### Added

#### CLI (`@knowledgine/cli`)

- Documentation, TUI, and setup experience overhaul
- Step-based progress display for the `init` command
- Enhanced error handling in `knowledgine init` — ENOSPC detection, network retry with exponential backoff

#### Infrastructure

- KPI alert automation for withdrawal criteria

### Fixed

#### Ingest (`@knowledgine/ingest`)

- Resolve init/ingest duplicate command registration
- Normalize path schemes for cross-platform compatibility

#### Core (`@knowledgine/core`)

- Security and DX improvements
- Model downloader: fix temporal dead zone error, platform-specific ONNX model selection
- Semantic search: proper sqlite-vec extension loading, vector table backfill with INTEGER cast

#### CLI (`@knowledgine/cli`)

- Search command: initialize embedding provider and load sqlite-vec for semantic mode
- ONNX model warmup step before batch embedding generation

### Changed

- Test improvements and code formatting unification
- `.gitignore`: allow root `CLAUDE.md` while ignoring nested ones

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

[0.3.0]: https://github.com/3062-in-zamud/knowledgine/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/3062-in-zamud/knowledgine/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/3062-in-zamud/knowledgine/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/3062-in-zamud/knowledgine/compare/v0.2.0...v0.2.1
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
