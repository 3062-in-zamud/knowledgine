[English](../README.md)

# knowledgine

開発者のナレッジインフラ — マークダウンノートから構造化された知識を抽出し、AI コーディングツールで活用できるようにします。

![CI](https://github.com/3062-in-zamud/knowledgine/actions/workflows/ci.yml/badge.svg)
[![npm](https://img.shields.io/npm/v/@knowledgine/cli)](https://www.npmjs.com/package/@knowledgine/cli)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

---

## なぜ knowledgine なのか

開発者はマークダウンノートに膨大な知識を蓄積しています。デバッグの記録、アーキテクチャ上の意思決定、問題と解決策のペア、苦労して得た教訓。しかしそれらはファイルの中に孤立したまま、AI コーディングアシスタントからは見えない状態が続いています。

knowledgine はそのギャップを埋めます。マークダウンファイルをスキャンしてパターン（問題と解決策のペア、コードスニペット、学習内容）を検出し、FTS5 全文検索を備えたローカル SQLite データベースに格納します。MCP サーバーがその知識を MCP 対応の AI ツールに公開し、必要なタイミングで適切なコンテキストをアシスタントが取得できるようになります。

---

## 前提条件

- **Node.js** >= 18.17.0
- **pnpm** >= 9（コントリビューション・ローカルビルド時）
- **`better-sqlite3` のネイティブビルドツール**:
  - macOS: `xcode-select --install`
  - Linux（Ubuntu/Debian）: `sudo apt-get install build-essential python3`
  - Windows: `npm install --global windows-build-tools`

---

## クイックスタート

インストールから MCP 連携まで 3 ステップで完了します。

### 1. インストール

```bash
npm install -g @knowledgine/cli
```

### 2. ノートをインデックス化

```bash
knowledgine init --path ./my-notes
```

マークダウンファイルをスキャンし、エンベディングモデル（約 23MB）をダウンロードし、全文検索・セマンティック検索インデックスを含む `.knowledgine/index.sqlite` を生成します。

### 3. AI ツールと接続

```bash
knowledgine setup --target claude-desktop --path ./my-notes
```

AI ツール向けの MCP 設定を生成します。`--write` を追加すると直接ファイルに書き込みます:

```bash
knowledgine setup --target claude-desktop --path ./my-notes --write
```

AI ツールを再起動して有効化。確認は:

```bash
knowledgine status --path ./my-notes
```

---

## コマンド

| コマンド | 説明                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| `init`   | マークダウンファイルをスキャン、エンベディングモデルをダウンロード、インデックスを構築 |
| `start`  | ファイル監視付き MCP サーバーを起動（増分更新）                                        |
| `setup`  | AI ツール（Claude Desktop、Cursor）向けの MCP 設定を生成                               |
| `status` | セットアップ状態を確認（データベース、モデル、MCP 設定）                               |

### init

```bash
knowledgine init --path ./my-notes
knowledgine init --path ./my-notes --skip-embeddings
```

- `--path <dir>`: スキャン対象ディレクトリ（デフォルト: カレントディレクトリ）
- `--skip-embeddings`: エンベディングモデルのダウンロードと生成をスキップ（テキスト検索は引き続き利用可能）

### setup

```bash
knowledgine setup --target claude-desktop --path ./my-notes
knowledgine setup --target cursor --path ./my-notes --write
```

- `--target <tool>`: 対象 AI ツール（`claude-desktop`、`cursor`）
- `--path <dir>`: インデックス済みノートのルートディレクトリ
- `--write`: 設定ファイルに書き込み（デフォルト: dry-run、設定内容の表示のみ）

### status

```bash
knowledgine status --path ./my-notes
```

データベース統計、モデルの利用可能状態、MCP 設定の状態、全体の準備状況を表示します。

---

## MCP ツール

接続後、AI アシスタントは以下のツールを利用できます。

| ツール             | 説明                                                                           | 主なパラメータ                                                |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `search_knowledge` | FTS5 を使用したインデックス全体の全文検索                                      | `query`（文字列、必須）、`limit`（数値、任意、デフォルト 10） |
| `find_related`     | タグ、タイトルの類似性、時間的近接性、問題と解決策のペアによる関連ノートの検索 | `notePath`（文字列、必須）、`strategies`（配列、任意）        |
| `get_stats`        | ナレッジベースの統計情報（総ノート数、インデックスサイズ、最終更新日時）を取得 | —                                                             |
| `search_entities`  | 名前やタイプでナレッジグラフのエンティティを検索                               | `query`（文字列、必須）、`entityType`（文字列、任意）         |
| `get_entity_graph` | エンティティの関係性とリンクされたノートを取得                                 | `entityName`（文字列、必須）                                  |

---

## MCP クライアント設定

### Claude Desktop

`knowledgine setup` で自動設定できます。手動の場合は `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）または `~/.config/claude/claude_desktop_config.json`（Linux）に追加します。

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

`knowledgine setup --target cursor` で自動設定できます。手動の場合はプロジェクトルートの `.cursor/mcp.json`（推奨）またはグローバル設定 `~/.cursor/mcp.json` に追加します。

`${workspaceFolder}` を使うと現在のプロジェクトディレクトリを自動的に参照できます。

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

詳細な手順・変数展開の説明・トラブルシューティングは [Cursor セットアップガイド](./cursor-setup.md) を参照してください。

---

## アーキテクチャ

```
@knowledgine/cli
├── @knowledgine/mcp-server
│   └── @knowledgine/core
└── @knowledgine/core
```

| パッケージ                | 説明                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@knowledgine/core`       | ナレッジ抽出エンジン。マークダウン内のパターン（問題と解決策のペア、コードブロック、タグ）を検出し、3 階層メモリモデルを管理し、SQLite 経由で FTS5 検索を提供します。 |
| `@knowledgine/mcp-server` | MCP 対応 AI クライアントに `search_knowledge`、`find_related`、`get_stats`、`search_entities`、`get_entity_graph` ツールを公開する MCP サーバーです。                 |
| `@knowledgine/cli`        | コマンドラインインターフェース。`init` でインデックス構築とモデルダウンロード、`setup` で AI ツール設定、`start` でファイル監視付き MCP サーバーを起動します。        |

---

## 設定

knowledgine は合理的なデフォルト値を持っています。`init` や `start` へのオプション指定、または生成された設定ファイルの編集で変更できます。

| フィールド       | デフォルト            | 説明                                                                   |
| ---------------- | --------------------- | ---------------------------------------------------------------------- |
| `dataDir`        | `.knowledgine`        | SQLite インデックスを保存するディレクトリ（`--path` からの相対パス）。 |
| `watchPatterns`  | `["**/*.md"]`         | インデックス化・監視するファイルの glob パターン。                     |
| `ignorePatterns` | `["node_modules/**"]` | 除外するファイルの glob パターン。                                     |

---

## トラブルシューティング

### ネイティブビルドの失敗（`better-sqlite3`）

```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install build-essential python3

# Windows
npm install --global windows-build-tools
```

### エンベディングモデルのダウンロード失敗

`init` でモデルのダウンロードに失敗してもテキスト検索（FTS5）は利用できます。再試行:

```bash
knowledgine init --path ./my-notes
```

エンベディングを完全にスキップする場合:

```bash
knowledgine init --path ./my-notes --skip-embeddings
```

### MCP 接続の問題

1. セットアップ確認: `knowledgine status --path ./my-notes`
2. 設定の再生成: `knowledgine setup --target claude-desktop --path ./my-notes --write`
3. 設定書き込み後に AI ツールを再起動
4. 設定内のパスがノートディレクトリと一致しているか確認

---

## コントリビューション

開発環境のセットアップ、コミット規約、プルリクエストのガイドラインは [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

---

## ライセンス

MIT — 詳細は [LICENSE](../LICENSE) を参照してください。
