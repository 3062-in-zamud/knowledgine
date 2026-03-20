# MCPディレクトリ登録ガイド

Knowledgine を各 MCP ディレクトリに登録するための手順書。

## スコープ定義

### Phase 1 スコープ（本ガイド対象）

| ディレクトリ      | 前提条件                       | 状態                |
| ----------------- | ------------------------------ | ------------------- |
| 公式 MCP Registry | GitHubリポジトリ公開 + npm公開 | npm公開後に申請可能 |
| mcp.so            | GitHubリポジトリ公開のみ       | 申請可能            |

### Phase 1 外スコープ（npm公開後）

| ディレクトリ | 前提条件               | 備考            |
| ------------ | ---------------------- | --------------- |
| Smithery     | npm パッケージ公開済み | npm公開後に対応 |

---

## 前提条件チェックリスト

登録申請前に以下をすべて確認すること。

- [ ] GitHubリポジトリが public になっている（`https://github.com/3062-in-zamud/knowledgine`）
- [ ] `packages/cli`、`packages/mcp-server`、`packages/core` が npm に公開されている
- [ ] `@knowledgine/cli` の `package.json` に `mcpName: "io.github.3062-in-zamud/knowledgine"` が設定されている
- [ ] リポジトリルートに `server.json` が存在する
- [ ] `server.json` の `name` が `mcpName` と一致している

---

## 1. 公式 MCP Registry への登録

### 概要

`mcp-publisher` CLI を使って `server.json` を MCP Registry に送信する。
DNS 認証ではなく GitHub 認証を使用するため、サーバー名は `io.github.3062-in-zamud/` で始まる必要がある。

### 手順

#### ステップ 1: npm パッケージを公開する

```bash
# ビルド
pnpm run build

# npm に公開（初回）
npm adduser
npm publish --access public --workspace packages/cli
npm publish --access public --workspace packages/mcp-server
npm publish --access public --workspace packages/core
```

#### ステップ 2: mcp-publisher をインストールする

```bash
# macOS/Linux
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# Homebrew
brew install mcp-publisher

# 確認
mcp-publisher --help
```

#### ステップ 3: GitHub 認証でログインする

```bash
mcp-publisher login github
```

表示された URL（`https://github.com/login/device`）にアクセスし、コードを入力して認証を完了させる。

#### ステップ 4: server.json を確認する

リポジトリルートの `server.json` を確認し、バージョンが最新の npm 公開バージョンと一致していることを確認する。

```bash
cat server.json
```

#### ステップ 5: MCP Registry に公開する

```bash
mcp-publisher publish
```

成功すると以下のような出力が表示される：

```
Publishing to https://registry.modelcontextprotocol.io...
✓ Successfully published
✓ Server io.github.3062-in-zamud/knowledgine version 0.0.1
```

#### ステップ 6: 公開を確認する

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.3062-in-zamud/knowledgine"
```

### トラブルシューティング

| エラー                                              | 対処                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `Registry validation failed for package`            | `package.json` に `mcpName` が設定されているか確認                  |
| `Invalid or expired Registry JWT token`             | `mcp-publisher login github` で再認証                               |
| `You do not have permission to publish this server` | GitHub アカウントと `io.github.` プレフィックスが一致しているか確認 |

---

## 2. mcp.so への登録

### 概要

mcp.so は GitHub URL のみで登録可能なディレクトリ。npm 公開が不要なため Phase 1 で対応できる。

### 手順

1. [https://mcp.so](https://mcp.so) にアクセス
2. 「Submit Server」または「Add Server」ボタンをクリック
3. 以下の情報を入力する：
   - **Repository URL**: `https://github.com/3062-in-zamud/knowledgine`
   - **Name**: `Knowledgine`
   - **Description**: `Extract structured knowledge from markdown notes for AI coding tools`
   - **Tags**: `mcp`, `knowledge-management`, `markdown`, `full-text-search`, `developer-tools`
4. 送信して審査を待つ

詳細な説明文は `docs/registry-descriptions.md` を参照すること。

---

## 3. Smithery への登録（npm公開後）

Smithery は npm パッケージの公開が前提条件のため、Phase 1 では対応しない。

npm 公開後に [https://smithery.ai](https://smithery.ai) の登録フローに従うこと。

---

## 参考リンク

- [公式 MCP Registry Quickstart](https://modelcontextprotocol.io/registry/quickstart)
- [mcp-publisher リリースページ](https://github.com/modelcontextprotocol/registry/releases)
- [server.json スキーマ](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json)
