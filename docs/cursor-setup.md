# Cursor MCP 設定ガイド

knowledgine を Cursor で使用するための詳細なセットアップガイドです。

---

## 前提条件

- **Node.js** >= 18.17.0
- **Cursor** がインストール済み
- **@knowledgine/cli** がインストール済み（`npm install -g @knowledgine/cli`）

---

## 設定方法

### 方法 1: プロジェクトレベル設定（推奨）

プロジェクトごとに異なるナレッジベースを使い分けたい場合に最適です。

プロジェクトルートに `.cursor/mcp.json` を作成します。

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

`.cursor/mcp.json` は `.gitignore` に追加するか、チームで共有するかを選択してください。

### 方法 2: グローバル設定

すべてのプロジェクトで同じナレッジベースを使用する場合は、`~/.cursor/mcp.json` に設定します。

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "npx",
      "args": ["@knowledgine/cli", "start"],
      "env": {
        "KNOWLEDGINE_ROOT_PATH": "/path/to/your/notes"
      }
    }
  }
}
```

---

## 変数展開

Cursor の MCP 設定では以下の変数が使用できます。

| 変数                   | 説明                                           | 例                                      |
| ---------------------- | ---------------------------------------------- | --------------------------------------- |
| `${workspaceFolder}`   | 現在開いているプロジェクトのルートディレクトリ | `/Users/username/projects/my-app`       |
| `${env:VARIABLE_NAME}` | 環境変数の参照                                 | `${env:HOME}`, `${env:NOTES_PATH}`      |
| `${userHome}`          | ホームディレクトリ                             | `/Users/username`（macOS/Linux の場合） |

**使用例:**

```json
{
  "mcpServers": {
    "knowledgine": {
      "command": "npx",
      "args": ["@knowledgine/cli", "start"],
      "env": {
        "KNOWLEDGINE_ROOT_PATH": "${userHome}/notes"
      }
    }
  }
}
```

---

## ステップバイステップ手順

### 1. @knowledgine/cli をインストール

```bash
npm install -g @knowledgine/cli
```

### 2. ナレッジベースを初期化

```bash
knowledgine init --path /path/to/your/notes
```

`.knowledgine/index.sqlite` が作成されます。

### 3. mcp.json を作成

プロジェクトルートで以下を実行します。

```bash
mkdir -p .cursor
cat > .cursor/mcp.json << 'EOF'
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
EOF
```

### 4. Cursor を再起動

設定を反映させるために Cursor を完全に再起動します（`Cmd+Q` または `Ctrl+Q` で終了後、再度起動）。

### 5. 接続確認

1. Cursor でチャットパネルを開く
2. モードを **Agent** に切り替える
3. MCP ツール一覧（`@` メニューまたは設定）に `knowledgine` が表示されていることを確認
4. 次のように問いかけてテストする:

```
@knowledgine search_knowledge で "エラー処理" について検索してください
```

---

## 利用可能なツール

接続後、AI アシスタントは以下のツールを利用できます。

### `search_knowledge`

ナレッジベース全体を FTS5 全文検索します。

| パラメータ | 型     | 必須 | 説明                      |
| ---------- | ------ | ---- | ------------------------- |
| `query`    | string | 必須 | 検索クエリ                |
| `limit`    | number | 任意 | 結果件数（デフォルト 10） |

**使用例:**

```
デバッグ中に発生した TypeError について検索してください
```

### `find_related`

指定したノートに関連するノートを検索します。タグ・タイトルの類似性・時間的近接性・問題解決ペアを考慮します。

| パラメータ   | 型     | 必須 | 説明                                                                     |
| ------------ | ------ | ---- | ------------------------------------------------------------------------ |
| `notePath`   | string | 必須 | 基準となるノートのパス                                                   |
| `strategies` | array  | 任意 | 検索戦略（`"tags"`, `"title"`, `"time"`, `"problem_solution"` から選択） |

**使用例:**

```
notes/2024-01-15-debug.md に関連するノートを探してください
```

### `get_stats`

ナレッジベースの統計情報（総ノート数・インデックスサイズ・最終更新日時）を取得します。

**使用例:**

```
ナレッジベースの状態を確認してください
```

---

## トラブルシューティング

### MCP サーバーが認識されない

**症状:** Cursor の MCP ツール一覧に `knowledgine` が表示されない

**対処法:**

1. `.cursor/mcp.json` の JSON 構文を確認する（[JSONLint](https://jsonlint.com/) 等で検証）
2. `command` が `npx` であることを確認し、フルパスが必要な場合は `which npx` で取得したパスを使用する
3. Cursor を完全再起動する（`Cmd+Q` / `Ctrl+Q` → 再起動）
4. プロジェクトレベルとグローバルの両方の設定が競合していないか確認する

### サーバー起動失敗

**症状:** MCP は認識されているが、ツールが使用できない・エラーが発生する

**対処法:**

1. **npx キャッシュをクリア:**
   ```bash
   npx --yes @knowledgine/cli --version
   ```
2. **Node.js バージョンを確認:**
   ```bash
   node --version  # 18.17.0 以上であること
   ```
3. **init が実行済みか確認:**
   ```bash
   ls /path/to/notes/.knowledgine/index.sqlite
   ```
   ファイルが存在しない場合は `knowledgine init --path /path/to/notes` を実行する

### ツールが表示されない（チャット内）

**症状:** MCP は接続されているが、チャットでツールが使えない

**対処法:**

1. チャットのモードが **Agent** になっているか確認する（Normal/Ask モードでは MCP ツールは使用不可）
2. Cursor の設定（`Settings > Features > MCP`）で knowledgine が有効化されているか確認する
3. Cursor は 1 つのエージェントセッションで最大 **40 ツール** までしか使用できない。他の MCP サーバーのツール数が多い場合は、不要な MCP サーバーを無効にする

### ログの確認方法

MCP サーバーのログは Cursor の Output パネルで確認できます。

1. メニューバー: **View > Output**（または `Cmd+Shift+U` / `Ctrl+Shift+U`）
2. ドロップダウンメニューから **"MCP Logs"** または **"MCP Server: knowledgine"** を選択
3. エラーメッセージや起動ログを確認する

---

## 参考リンク

- [セットアップガイド全般](./setup-guide.md)
- [README（英語）](../README.md)
- [README（日本語）](./README.ja.md)
