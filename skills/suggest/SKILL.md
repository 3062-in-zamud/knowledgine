---
name: suggest
version: "0.1.0"
description: "現在の作業コンテキストから関連する過去の知識・解決パターンを提案"
triggers:
  - command: "knowledgine suggest"
  - when: "新しい問題に直面したとき"
usage:
  - "knowledgine suggest '<検索クエリ>'"
  - "knowledgine suggest --context '<現在困っていること>'"
  - "knowledgine suggest --file <作業中のファイルパス>"
output: "関連PSP、パターンをスコア付きで表示"
---

# suggest スキル

## 概要

現在の作業コンテキストから、関連する過去の知識・問題解決パターン（PSP）を提案します。
ハイブリッド検索（キーワード + セマンティック）を使用して、意味的に近い知識も幅広く取得します。

## When to use

- 新しいエラーや問題に直面したとき、過去の解決策を探すとき
- 実装パターンの参考として過去の知見を確認したいとき
- 作業中のファイルに関連する知識ベースのパターンを確認したいとき

## When NOT to use

- 単純なキーワード検索で十分なとき（`recall` を使う）
- 新しい知識を記録したいとき（`capture` を使う）

## Inputs

### Required (いずれか1つ)

- `[query]`: 検索クエリ（位置引数）
- `--context <text>`: 現在困っていること・コンテキストの説明
- `--file <path>`: 作業中のファイルパス（先頭200文字をクエリとして使用）

### Optional

- `--format <format>`: 出力形式 `plain`（デフォルト）または `json`
- `--limit <n>`: 最大件数（デフォルト: 5）
- `--path <dir>`: プロジェクトルートディレクトリ

## 使い方

```bash
# クエリで検索
knowledgine suggest "TypeScript type error"

# コンテキストで検索
knowledgine suggest --context "DBコネクションが切れる問題"

# 作業中ファイルのコンテキストで検索
knowledgine suggest --file src/auth/login.ts

# JSON形式で出力
knowledgine suggest "authentication" --format json

# 件数を絞る
knowledgine suggest "React rendering" --limit 3

# パスを指定
knowledgine suggest "error handling" --path ~/notes
```

## Output Example (plain)

```
Suggestions for "TypeScript type error":

  1. [0.85] packages/core/errors.ts
     Custom error classes pattern
     PSP: "Database errors → Use DatabaseError wrapper with context" (confidence: 0.92)

  2. [0.72] docs/patterns.md
     Error handling best practices

No more results.
```

## Output Example (json)

```json
{
  "query": "TypeScript type error",
  "mode": "hybrid",
  "results": [...],
  "psp": [...]
}
```

## Best Practices

- 具体的なエラーメッセージや症状をクエリに使うと精度が上がる
- `--file` オプションで作業中ファイルを指定すると、そのコンテキストに合った提案が得られる
- PSP（Problem-Solution Pairs）が表示された場合、過去に同様の問題を解決した実績がある
- 件数が多い場合は `--limit` で絞り込む
