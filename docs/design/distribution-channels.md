# 配信チャネル設計ドキュメント

## Executive Summary

knowledgine の配信チャネルを 3 つに整理し、優先順位付きのロードマップを定義する。

| チャネル           | 優先度 | 状態                                      |
| ------------------ | ------ | ----------------------------------------- |
| CLI スタンドアロン | P0     | 現行（npm 配布済み）                      |
| REST API 拡張      | P1     | 現行（`knowledgine serve`）+ 機能追加予定 |
| VS Code 拡張       | P2     | 未実装                                    |

---

## Channel 1: CLI スタンドアロン（P0 — 現行 + 強化）

### 現状

- npm パッケージ `knowledgine` として配布（Node.js 20+ 必須）
- Commander.js ベースの CLI（`packages/cli/src/index.ts`）
- 主要コマンド: `init`, `start`, `setup`, `ingest`, `search`, `capture`, `serve` など
- `@hono/node-server` を内部依存として持つ

### 強化パス

#### バイナリ配布

| 手段                  | メリット                       | リスク                                                      |
| --------------------- | ------------------------------ | ----------------------------------------------------------- |
| `bun build --compile` | Node.js 依存なし、単一バイナリ | `better-sqlite3`（ネイティブ C++ モジュール）の互換性未検証 |
| `pkg` (vercel/pkg)    | Node.js 18/20 サポート実績     | メンテナンス停止、同様のネイティブモジュール問題            |
| `ncc` + 同梱 Node.js  | 比較的安定                     | バイナリサイズが大きい（Node.js 含む）                      |

> **注意**: `better-sqlite3` および `onnxruntime-node` はどちらもネイティブ C++ バインディングを持つ。バイナリ配布を選択する場合は、ターゲットプラットフォーム（linux/amd64, darwin/arm64, darwin/amd64, win32/x64）ごとのビルド検証が必須。

#### パッケージマネージャー配布

- **Homebrew formula（macOS）**: `brew install knowledgine`
  - Formula でバイナリを配布するか、Node.js 依存を宣言するかを選択
- **プラットフォーム固有インストーラー**
  - `.deb` / `.rpm`（Linux）
  - `.msi` または WinGet manifest（Windows）

### トレードオフ

| 観点                 | npm（現行）            | バイナリ配布                         |
| -------------------- | ---------------------- | ------------------------------------ |
| インストール容易性   | Node.js が必要         | Node.js 不要                         |
| バイナリサイズ       | N/A（ソース配布）      | 50–150 MB（Node.js 同梱時）          |
| ネイティブモジュール | npm install 時にビルド | 事前ビルド + ターゲット別配布が必要  |
| 更新容易性           | `npm i -g knowledgine` | 各パッケージマネージャーの更新フロー |

---

## Channel 2: REST API 拡張（P1）

### 現状

`knowledgine serve` コマンドで起動する Hono ベースの HTTP サーバー（`packages/mcp-server/src/rest-server.ts`）。

| エンドポイント          | メソッド | 説明                                             |
| ----------------------- | -------- | ------------------------------------------------ |
| `/health`               | GET      | ヘルスチェック（バージョン・ノート数）           |
| `/search`               | GET      | フルテキスト / セマンティック / ハイブリッド検索 |
| `/stats`                | GET      | ナレッジベース統計                               |
| `/entities`             | GET      | エンティティ検索                                 |
| `/entities/:name/graph` | GET      | エンティティグラフ取得                           |
| `/related/:noteId`      | GET      | 関連ノート検索                                   |

デフォルト設定: `http://127.0.0.1:3456`（ローカルホスト限定）

### 強化パス

#### POST /capture

知識の取り込みエンドポイント（現在は MCP ツール `capture_knowledge` のみ対応）。
REST API からの capture を可能にすることで、Claude 以外のクライアントや外部スクリプトからの書き込みを実現する。

- 認証: Bearer トークン（`.knowledginerc.json` の `serve.authToken`）
- リクエストボディ: `{ content, title?, tags?, source? }`

#### WebSocket によるリアルタイム更新

`/ws` エンドポイントで以下のイベントをプッシュ配信:

- ingest 進捗（処理済みノート数、エラー情報）
- 新規ノート追加通知
- インデックス更新完了

#### OpenAPI スペック生成

`@hono/swagger-ui` を使用して `/docs` に Swagger UI を提供。API の自動ドキュメント化と外部クライアントの統合を容易にする。

#### コンテナイメージ

既存の `Dockerfile` を活用（現状は MCP サーバーとしての起動のみ）。REST サーバーモードでの起動をサポートするよう拡張:

```dockerfile
# REST API モードで起動する場合の例
CMD ["node", "packages/cli/dist/index.js", "serve", "--port", "3456", "--host", "0.0.0.0"]
```

> **現状の Dockerfile 制約**: ランタイムに `node:20`（フルイメージ）を使用。`onnxruntime-node` が `libstdc++` を要求するため、`node:20-slim` や Alpine は使用不可。

#### クラウドデプロイガイド

セルフホスト向けに主要 PaaS での手順を整備:

| プラットフォーム | 特記事項                                               |
| ---------------- | ------------------------------------------------------ |
| Railway          | Dockerfile 自動検出、永続ボリュームでデータ保持        |
| Fly.io           | `fly.toml` の volumes 設定で SQLite データ永続化       |
| Render           | Persistent Disk でデータ保持、無料プランは一時停止あり |

SQLite ファイルの永続化（`.knowledgine/` ディレクトリ）が必須要件。

### 認証戦略

| フェーズ | 方式                       | 対象                           |
| -------- | -------------------------- | ------------------------------ |
| 現行     | なし（ローカルホスト限定） | ローカル利用                   |
| 近期     | Bearer トークン            | セルフホスト、シングルユーザー |
| 将来     | OAuth2 / OIDC              | マルチユーザー、チーム利用     |

---

## Channel 3: VS Code 拡張（P2）

### アーキテクチャ選択肢

| オプション               | 概要                                          | 評価                                                             |
| ------------------------ | --------------------------------------------- | ---------------------------------------------------------------- |
| A: in-process            | 拡張が `@knowledgine/core` を直接バンドル     | 高速だが、拡張バンドルサイズが巨大化（ネイティブモジュール問題） |
| B: REST API クライアント | 拡張が `knowledgine serve` の REST API に接続 | **推奨**                                                         |
| C: stdio MCP             | 拡張が子プロセスとして knowledgine を起動     | MCP プロトコル処理が複雑                                         |

### 推奨: Option B（REST API クライアント）

**理由:**

- `better-sqlite3` / `onnxruntime-node` のネイティブモジュールを拡張にバンドルする必要がない
- REST API の安定した契約に依存するため、コアの実装変更の影響を受けにくい
- デバッグが容易（curl や Postman で API 単体テスト可能）
- knowledgine サーバーを複数のクライアントで共有できる

**前提**: ユーザーが `knowledgine serve` を別途起動している必要がある（またはバックグラウンドサービスとして自動起動）。

### MVP 機能スコープ

| 機能                                   | 実装方法                                                  |
| -------------------------------------- | --------------------------------------------------------- |
| サイドバーパネル（検索結果表示）       | TreeView または Webview                                   |
| Command Palette: 検索                  | `vscode.window.showQuickPick` + `/search` API             |
| Command Palette: キャプチャ            | `vscode.window.showInputBox` + `POST /capture`            |
| Status Bar: ノート数・最終 ingest 時刻 | `StatusBarItem` + `/stats` API                            |
| Hover Provider: 関連ノート表示         | `HoverProvider` + `/related/:noteId` または `/search` API |

### 技術的考慮事項

- **VS Code Extension API**: `vscode` モジュールへの依存（bundler で externals 指定）
- **Webview**: 検索結果の Rich UI 表示に使用（HTML/CSS/JS を VS Code の Webview で描画）
- **設定のマッピング**: VS Code の `settings.json` → `.knowledginerc.json` の設定値を自動マッピング
  - `knowledgine.serverUrl` → REST API の接続先（デフォルト: `http://127.0.0.1:3456`）
  - `knowledgine.authToken` → Bearer トークン
- **リポジトリ構成**: monorepo 内の `packages/vscode-extension` vs 独立リポジトリ（後述）

---

## 優先度ロードマップ

| フェーズ  | チャネル       | 主要成果物                                     |
| --------- | -------------- | ---------------------------------------------- |
| 1（現行） | CLI            | npm 配布、`knowledgine serve`                  |
| 2         | REST API       | `POST /capture`、Bearer 認証                   |
| 3         | CLI バイナリ   | Homebrew formula、スタンドアロンバイナリ       |
| 4         | VS Code MVP    | 検索 + キャプチャ                              |
| 5         | コンテナ       | Docker イメージ、Railway/Fly.io デプロイガイド |
| 6         | VS Code 完全版 | Marketplace 公開、全機能対応                   |

---

## 意思決定マトリックス

| 評価基準                   | CLI              | REST API   | VS Code        |
| -------------------------- | ---------------- | ---------- | -------------- |
| リーチ（到達ユーザー数）   | 中               | 高         | 高             |
| 開発コスト                 | 低               | 中         | 高             |
| 保守コスト                 | 低               | 中         | 高             |
| UX 品質                    | 中               | N/A（API） | 高             |
| 依存関係                   | Node.js          | Node.js    | REST API       |
| ネイティブモジュールリスク | 高（バイナリ時） | 低         | 低（Option B） |

---

## オープンクエスチョン

1. **VS Code 拡張のリポジトリ構成**: monorepo 内（`packages/vscode-extension`）vs 独立リポジトリ
   - Monorepo: 共有型定義の再利用が容易、リリースサイクルが knowledgine 本体に連動
   - 独立リポジトリ: VS Code Marketplace のリリースを独立して管理できる

2. **バイナリ配布のライセンス考慮**: 依存パッケージのライセンス（MIT/Apache-2.0 が主）のバイナリ同梱可否を確認。特に `onnxruntime-node`（MIT）と `better-sqlite3`（MIT）は問題ないが、全依存の棚卸しが必要。

3. **Telemetry / Analytics 戦略**: 利用状況の把握（コマンド実行回数、機能利用率）のためのオプトイン telemetry。実装する場合は明示的な同意取得とデータ最小化が必要。
