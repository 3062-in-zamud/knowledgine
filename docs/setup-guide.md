# Knowledgine セットアップガイド

## 前提条件

- **Node.js** >= 18.17.0
- **pnpm** >= 9

## インストール

### グローバルインストール

```bash
npm install -g @knowledgine/cli
```

### ローカル開発

```bash
git clone https://github.com/your-org/knowledgine.git
cd knowledgine
pnpm install
pnpm run build
```

## 初期設定

### ナレッジベースの初期化

```bash
# カレントディレクトリのMarkdownファイルをインデックス化
knowledgine init

# 特定ディレクトリを指定
knowledgine init --path /path/to/your/notes
```

初期化すると `.knowledgine/index.sqlite` が作成されます。

## MCP クライアント設定

### Claude Code (Claude Desktop)

`~/.config/claude/claude_desktop_config.json` に以下を追加:

#### npx 版（推奨）

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "npx",
      "args": ["-y", "@knowledgine/mcp-server"],
      "env": {
        "KNOWLEDGINE_ROOT_PATH": "/path/to/your/notes",
        "KNOWLEDGINE_DB_PATH": "/path/to/your/notes/.knowledgine/index.sqlite"
      }
    }
  }
}
```

#### ローカルビルド版

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "node",
      "args": ["/path/to/knowledgine/packages/mcp-server/dist/index.js"],
      "env": {
        "KNOWLEDGINE_ROOT_PATH": "/path/to/your/notes",
        "KNOWLEDGINE_DB_PATH": "/path/to/your/notes/.knowledgine/index.sqlite"
      }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` に以下を追加:

#### npx 版

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "npx",
      "args": ["-y", "@knowledgine/mcp-server"],
      "env": {
        "KNOWLEDGINE_ROOT_PATH": "/path/to/your/notes",
        "KNOWLEDGINE_DB_PATH": "/path/to/your/notes/.knowledgine/index.sqlite"
      }
    }
  }
}
```

#### ローカルビルド版

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "node",
      "args": ["/path/to/knowledgine/packages/mcp-server/dist/index.js"],
      "env": {
        "KNOWLEDGINE_ROOT_PATH": "/path/to/your/notes",
        "KNOWLEDGINE_DB_PATH": "/path/to/your/notes/.knowledgine/index.sqlite"
      }
    }
  }
}
```

## 利用可能なツール

| ツール             | 説明                                        |
| ------------------ | ------------------------------------------- |
| `search_knowledge` | キーワードでナレッジベースを全文検索        |
| `find_related`     | 指定ノートの関連ノートと問題-解決ペアを検索 |
| `get_stats`        | ナレッジベースの統計情報を表示              |

## トラブルシューティング

### MCP サーバーが起動しない

1. Node.js バージョンを確認: `node --version` (18.17.0 以上)
2. データベースパスが正しいか確認
3. `knowledgine init` が実行済みか確認

### 検索結果が返らない

1. `knowledgine init` でインデックスが作成されているか確認
2. `.knowledgine/index.sqlite` が存在するか確認
3. Markdown ファイルに検索対象の内容が含まれているか確認

### better-sqlite3 ビルドエラー

```bash
# ネイティブモジュールのリビルド
npm rebuild better-sqlite3
# または
pnpm rebuild better-sqlite3
```

Python と C++ ビルドツールが必要な場合があります:

- **macOS**: `xcode-select --install`
- **Ubuntu**: `sudo apt-get install build-essential python3`
- **Windows**: `npm install --global windows-build-tools`

### パスの問題

- `KNOWLEDGINE_ROOT_PATH` は絶対パスを使用してください
- `KNOWLEDGINE_DB_PATH` を省略すると、`KNOWLEDGINE_ROOT_PATH/.knowledgine/index.sqlite` が使用されます
