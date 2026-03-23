---
name: recall
version: "0.1.0"
description: |
  What: 知識ベースからの検索・想起
  When: 過去の知見や解決策を探すとき、関連ドキュメントを参照するとき
  How: knowledgine search <query> or search_knowledge MCP tool
---

## When to use

- 過去に解決した問題の解決策を探すとき
- アーキテクチャ決定の根拠を確認するとき
- 関連するコードスニペットやパターンを探すとき
- デバッグのヒントや学習事項を参照するとき

## When NOT to use

- 新しい知識を記録したいとき（captureを使う）
- 外部ソースから一括取り込みするとき（ingestを使う）
- リアルタイムの情報が必要なとき（Web検索を使う）

## Inputs

### Required

- query: 検索クエリ（自然言語または技術キーワード）

### Optional

- mode: 検索モード（keyword / semantic / hybrid）
- limit: 最大件数（デフォルト: 20）
- path: ノートのルートディレクトリ

## Search Modes

| Mode       | 説明                            | 推奨場面                     |
| ---------- | ------------------------------- | ---------------------------- |
| `keyword`  | FTS5 全文検索（デフォルト）     | 正確なキーワードが分かるとき |
| `semantic` | ベクトル類似検索                | 意味的に近い文書を探すとき   |
| `hybrid`   | keyword + semantic の組み合わせ | 広く関連情報を集めたいとき   |

## Usage

```bash
# キーワード検索（デフォルト）
knowledgine search "React performance" --path ~/notes

# セマンティック検索
knowledgine search "メモリリークの修正方法" --mode semantic --path ~/notes

# ハイブリッド検索（広く関連情報を収集）
knowledgine search "authentication" --mode hybrid --path ~/notes --limit 10

# テーブル形式で表示
knowledgine search "debugging" --format table --path ~/notes
```

## Best Practices

- 最初は `keyword` モードで試す（高速・正確）
- キーワードで見つからない場合は `semantic` に切り替える
- 広くアイデアを集めたいときは `hybrid` を使う
- 関連ノートの探索には `--related <noteId>` オプションが有効
