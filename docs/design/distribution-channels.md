# Distribution Channels Design Document

knowledgine の配信チャネル設計と優先順位ロードマップ。

## Executive Summary

knowledgine は現在 MCP サーバー + CLI の2チャネルで提供されている。
本ドキュメントでは CLI スタンドアロン強化、REST API 拡張、VS Code 拡張の3チャネルを設計し、優先順位を定める。

---

## Channel 1: CLI Standalone (P0 — Current + Enhancements)

### Current State

- npm package `knowledgine`（Commander.js CLI）
- Node.js 20+ 依存
- コマンド: `init`, `ingest`, `search`, `serve`, `status`, `tool`, `capture`, `feedback`, `setup`, `start`, `upgrade`

### Enhancement Path

#### バイナリ配布

- `bun build --compile` または `pkg` でシングルバイナリ化
- メリット: Node.js 依存なし、インストール簡易化
- リスク: `better-sqlite3`（C++ ネイティブモジュール）の互換性、`onnxruntime-node`（オプション）のバンドル

#### パッケージマネージャ配布

- Homebrew formula for macOS: `brew install knowledgine`
- Platform-specific: `.deb`（Ubuntu/Debian）、`.rpm`（Fedora/RHEL）

### Trade-offs

| 方式        | インストール容易性 | バイナリサイズ | ネイティブモジュール互換 |
| ----------- | ------------------ | -------------- | ------------------------ |
| npm         | Medium             | N/A            | Native rebuild           |
| bun compile | High               | ~80MB+         | 要検証                   |
| pkg         | High               | ~60MB+         | 要検証                   |

---

## Channel 2: REST API Extension (P1)

### Current State

- Hono server via `knowledgine serve`（デフォルト: `127.0.0.1:3456`）
- GET endpoints: `/health`, `/search`, `/stats`, `/entities`, `/entities/:name/graph`, `/related/:noteId`
- POST `/capture`（KNOW-310 で追加）
- Bearer token 認証（POST のみ）
- Dockerfile 存在（マルチステージビルド）

### Enhancement Path

#### Phase 2a: API 完成

- POST `/capture` + Bearer auth（KNOW-310 — 実装済み/進行中）
- OpenAPI spec 自動生成（`@hono/swagger-ui` or `@hono/zod-openapi`）
- WebSocket for real-time updates（ingest 進捗、新規ノート通知）

#### Phase 2b: デプロイ

- Container image の最適化（現在の Dockerfile ベース）
- Cloud deployment ガイド: Railway, Fly.io, Render
- Environment variable 設定ドキュメント

#### Auth ロードマップ

- Current: Bearer token（単一ユーザー向け）
- Future: OAuth2 / API Key rotation（マルチユーザー向け）

---

## Channel 3: VS Code Extension (P2)

### Architecture Options

| Option | 方式                               | メリット                     | デメリット                                   |
| ------ | ---------------------------------- | ---------------------------- | -------------------------------------------- |
| A      | Extension が core をバンドル       | 低レイテンシ                 | Extension サイズ大、ネイティブモジュール問題 |
| B      | Extension が REST API に接続       | デカップリング、デバッグ容易 | `knowledgine serve` の事前起動が必要         |
| C      | Extension が子プロセスで stdio MCP | MCP 標準準拠                 | プロセス管理の複雑さ                         |

### 推奨: Option B（REST API 接続）

- 理由: REST API の安定性が保証されていれば、Extension は薄いクライアントで済む
- `knowledgine serve` の自動起動機能を Extension に組み込む

### MVP Feature Scope

1. **サイドバーパネル**: 検索結果の TreeView 表示
2. **Command Palette**: `Knowledgine: Search`, `Knowledgine: Capture`
3. **Status Bar**: ノート件数、最終 ingest 日時
4. **Hover Provider**: 現在のファイルパスに関連するナレッジをホバー表示
5. **CodeLens**: 関数/クラス定義上に関連ナレッジ数を表示

### Technical Considerations

- VS Code Extension API（`vscode` モジュール）
- Webview for rich search results（Markdown レンダリング）
- Configuration: VS Code `settings.json` → `.knowledginerc.json` マッピング
- リポジトリ: monorepo 内 `packages/vscode-extension/` が推奨（共有型定義の再利用）

---

## Priority Roadmap

| Phase | Channel       | 時期    | Key Deliverable                  |
| ----- | ------------- | ------- | -------------------------------- |
| 1     | CLI 安定化    | Current | npm 配布、dogfooding             |
| 2     | REST API 完成 | Next    | POST /capture, auth, OpenAPI     |
| 3     | CLI バイナリ  | Future  | Homebrew, standalone binary      |
| 4     | VS Code MVP   | Future  | Search + Capture                 |
| 5     | Container     | Future  | Docker image, cloud deploy guide |
| 6     | VS Code Full  | Future  | Full features, Marketplace 公開  |

---

## Decision Matrix

| 基準               | CLI                  | REST API           | VS Code         |
| ------------------ | -------------------- | ------------------ | --------------- |
| リーチ             | Medium               | High（ツール連携） | High（IDE統合） |
| 開発工数           | Low                  | Medium             | High            |
| メンテナンスコスト | Low                  | Medium             | High            |
| UX                 | Medium（ターミナル） | N/A（API）         | High（GUI）     |
| 依存関係           | Node.js              | Node.js            | REST API        |

---

## Open Questions

1. **VS Code 拡張のリポジトリ配置**: monorepo 内 vs 別リポ — 型定義の共有を考えると monorepo 内が有利
2. **バイナリ配布のライセンス**: better-sqlite3 (MIT), onnxruntime (MIT) — 問題なし
3. **Telemetry/Analytics**: opt-in telemetry の導入是非（プライバシー vs プロダクト改善）
4. **Multi-platform CI**: バイナリ配布時に macOS/Linux/Windows の CI matrix が必要
