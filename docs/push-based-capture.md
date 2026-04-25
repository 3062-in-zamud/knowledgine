# Push-Based Capture: POST /capture Endpoint

AIツール（Cline, Windsurf, Cursor等）からknowledgineに知識をプッシュするためのRESTエンドポイントです。

## Overview

`knowledgine serve` コマンドで起動するRESTサーバーに `POST /capture` エンドポイントを追加しました。
Bearer token認証付きで、AIコーディングツールのhookからセッション後に自動的にナレッジをキャプチャできます。

## Setup

### 1. 認証トークンの設定

**環境変数（優先）:**

```bash
export KNOWLEDGINE_API_TOKEN="your-secret-token"
```

**RCファイル（フォールバック）:**

```jsonc
// .knowledginerc.json
{
  "serve": {
    "authToken": "your-secret-token",
  },
}
```

`authToken` が設定されていない場合、`POST /capture` は無効（404）になります。
`GET /health`, `GET /search` などの既存エンドポイントはトークン不要で引き続き動作します。

### 2. サーバー起動

```bash
KNOWLEDGINE_API_TOKEN="your-secret-token" knowledgine serve
```

起動時に以下のように表示されます:

```
knowledgine REST API server running
  URL:    http://127.0.0.1:3456
  Notes:  42 indexed
  Search: FTS5 only
  Capture: POST /capture enabled (auth required)
```

## API Reference

### POST /capture

**Request Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "content": "知識の本文（必須、最大100,000文字）",
  "title": "タイトル（任意、最大200文字）",
  "tags": ["tag1", "tag2"],
  "source": "cline"
}
```

**Response (201 Created):**

```json
{
  "id": 42,
  "title": "Auto-extracted or provided title",
  "tags": ["tag1", "tag2"],
  "sourceUri": "capture://cline"
}
```

**Error Responses:**

- `401` - 認証ヘッダーなし or トークン不一致
- `400` - リクエストボディ不正（空コンテンツ等）

## curl Examples

```bash
TOKEN="your-secret-token"
BASE_URL="http://127.0.0.1:3456"

# 基本的なキャプチャ
curl -X POST "$BASE_URL/capture" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "TypeScriptのESM対応では.js拡張子が必須。tsconfig.jsonでmoduleResolution: bundlerを使う。",
    "title": "TypeScript ESM設定メモ",
    "tags": ["typescript", "esm"],
    "source": "manual"
  }'

# タイトルなし（コンテンツ先頭50文字から自動生成）
curl -X POST "$BASE_URL/capture" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "pnpm workspacesでのビルド順序: mcp-memory-protocol -> core -> ingest -> mcp-server -> cli"}'
```

## AI Tool Hook Configuration

### Cline (VS Code Extension)

Clineの `.clinerules` または Post-Task Hook でキャプチャを自動化します。

**Cline Post-Completion Hook (`~/.cline/hooks/post-task.sh`):**

```bash
#!/bin/bash
# Cline タスク完了後に自動キャプチャ
if [ -n "$TASK_SUMMARY" ]; then
  curl -s -X POST "http://127.0.0.1:3456/capture" \
    -H "Authorization: Bearer ${KNOWLEDGINE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"content\": $(echo "$TASK_SUMMARY" | jq -Rs .),
      \"source\": \"cline\",
      \"tags\": [\"ai-session\", \"cline\"]
    }"
fi
```

**注意:** ClineのPost-Task Hookは現時点で安定したAPIを持っていません。
`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/` のストレージ形式は非公開であり、バージョン間で変わる可能性があります。
そのため、**プッシュ型（手動またはスクリプトによるcurl呼び出し）を推奨します。**

### Windsurf

Windsurfの `.windsurf/rules` または Cascade Post-Response Action:

```bash
#!/bin/bash
# Windsurf セッション後キャプチャ
curl -s -X POST "http://127.0.0.1:3456/capture" \
  -H "Authorization: Bearer ${KNOWLEDGINE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": $(cat /tmp/windsurf_session.txt | jq -Rs .),
    \"source\": \"windsurf\",
    \"tags\": [\"ai-session\", \"windsurf\"]
  }"
```

### Cursor

Cursorの `.cursorrules` にpost-actionを追加、またはTerminal hookで:

```bash
#!/bin/bash
# Cursor セッション後キャプチャ
curl -s -X POST "http://127.0.0.1:3456/capture" \
  -H "Authorization: Bearer ${KNOWLEDGINE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"${SESSION_CONTENT}\",
    \"source\": \"cursor\",
    \"tags\": [\"ai-session\", \"cursor\"]
  }"
```

### Claude Code (claude.ai/code)

`/knowledgine-capture` スキルを使うか、セッション後にターミナルで:

```bash
knowledgine capture add --content "セッションサマリー" --tags "ai-session,claude-code"
```

## Cline Storage Investigation Results

2026-04 の再評価により、Cline 3.x の JSON ベースストレージレイアウトが安定していることを確認し、pull 型 ingest プラグインを実装しました。詳細は [`docs/research/cline-session-storage.md`](research/cline-session-storage.md) を参照してください。

### Pull 型 (推奨): `cline-sessions` プラグイン

```bash
# OS デフォルトの globalStorage を取り込み
knowledgine ingest --source cline-sessions --path ./my-notes

# テスト用 fixture や別インストール先を指定する場合
CLINE_STORAGE_PATH=/abs/path/to/saoudrizwan.claude-dev knowledgine ingest --source cline-sessions --path ./my-notes
```

- セッション履歴の遡及取り込みが可能
- 1 タスク = 1 ノートとして検索可能
- secret redaction (`sanitizeContent`) を経由

### Push 型 (本ドキュメントの API): 引き続き有効

push 型は Windsurf / Codex CLI / Copilot Chat など pull 未対応ツール、および手動キャプチャ用途で引き続き利用可能です。Pull / Push は併用関係であり相互排他ではありません。

Push 型の利点：

- AIツールに依存しない汎用的なインターフェース
- セキュリティが明確（Bearer token認証）
- 任意のスクリプトやCLIから利用可能

## Security Notes

- トークンは `KNOWLEDGINE_API_TOKEN` 環境変数で管理（`.knowledginerc.json` に書く場合はgitignoreに注意）
- timing-safe比較（`crypto.timingSafeEqual`）でタイミング攻撃を防止
- リクエストボディは100,000文字上限、タグは最大20個
- `POST /capture` はlocalhost（127.0.0.1）バインドのみを前提としています
