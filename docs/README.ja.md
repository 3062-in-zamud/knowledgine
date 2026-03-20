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

## クイックスタート

インストールから MCP 連携まで 5 分で完了します。

### 1. インストール

```bash
npm install -g @knowledgine/cli
```

### 2. ノートをインデックス化

```bash
knowledgine init --path ./my-notes
```

`./my-notes` 配下のすべてのマークダウンファイルをスキャンし、`.knowledgine/index.sqlite` を生成します。

### 3. MCP サーバーを起動

```bash
knowledgine start --path ./my-notes
```

### 4. AI ツールと接続

Claude Code の MCP 設定に以下を追加してください。

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

## MCP ツール

接続後、AI アシスタントは以下のツールを利用できます。

| ツール             | 説明                                                                           | 主なパラメータ                                                |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `search_knowledge` | FTS5 を使用したインデックス全体の全文検索                                      | `query`（文字列、必須）、`limit`（数値、任意、デフォルト 10） |
| `find_related`     | タグ、タイトルの類似性、時間的近接性、問題と解決策のペアによる関連ノートの検索 | `notePath`（文字列、必須）、`strategies`（配列、任意）        |
| `get_stats`        | ナレッジベースの統計情報（総ノート数、インデックスサイズ、最終更新日時）を取得 | —                                                             |

---

## MCP クライアント設定

### Claude Code

`~/.config/claude/claude_desktop_config.json` に追加します。

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

`.cursor/mcp.json` に追加します。

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
| `@knowledgine/mcp-server` | MCP 対応 AI クライアントに `search_knowledge`、`find_related`、`get_stats` ツールを公開する MCP サーバーです。                                                        |
| `@knowledgine/cli`        | コマンドラインインターフェース。`init` はノートのバッチインデックス処理を実行し、`start` はファイルウォッチャーを使った増分更新機能付きで MCP サーバーを起動します。  |

---

## 設定

knowledgine は合理的なデフォルト値を持っています。`init` や `start` へのオプション指定、または生成された設定ファイルの編集で変更できます。

| フィールド       | デフォルト            | 説明                                                                   |
| ---------------- | --------------------- | ---------------------------------------------------------------------- |
| `dataDir`        | `.knowledgine`        | SQLite インデックスを保存するディレクトリ（`--path` からの相対パス）。 |
| `watchPatterns`  | `["**/*.md"]`         | インデックス化・監視するファイルの glob パターン。                     |
| `ignorePatterns` | `["node_modules/**"]` | 除外するファイルの glob パターン。                                     |

---

## 前提条件

- **Node.js** >= 18.17.0
- **pnpm** >= 9（コントリビューション・ローカルビルド時）
- **`better-sqlite3` のネイティブビルドツール**:
  - macOS: `xcode-select --install`
  - Linux（Ubuntu/Debian）: `sudo apt-get install build-essential python3`
  - Windows: `npm install --global windows-build-tools`

---

## コントリビューション

開発環境のセットアップ、コミット規約、プルリクエストのガイドラインは [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

---

## ライセンス

MIT — 詳細は [LICENSE](../LICENSE) を参照してください。
