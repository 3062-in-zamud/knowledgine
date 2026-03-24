---
name: explain
version: "0.1.0"
description: |
  What: エンティティ・ノートの背景・経緯をProvenance付きで時系列説明
  When: なぜこの設計になったか知りたいとき、エンティティの来歴を確認するとき
  How: knowledgine explain --entity <name> or explain <query>
triggers:
  - command: "knowledgine explain"
  - when: "なぜこの設計になったか知りたいとき"
  - when: "エンティティの来歴・経緯を調べるとき"
usage:
  - "knowledgine explain --entity '<エンティティ名>'"
  - "knowledgine explain --note-id <id>"
  - "knowledgine explain '<検索クエリ>'"
output: "Provenance付き時系列説明、出典リンク付き"
---

# explain スキル

## 概要

エンティティやノートの背景・経緯をProvenance（来歴）情報付きで説明します。
いつ、どのソースから、どのような経緯で知識が生成されたかを時系列で確認できます。

## When to use

- 特定のエンティティがなぜ知識ベースに存在するか確認したいとき
- 設計決定の背景や根拠を時系列で追いたいとき
- エンティティに関連するノート・パターン・解決策を一覧したいとき
- ノートIDから関連する知識グラフを確認したいとき

## When NOT to use

- 新しい知識を記録したいとき（capture を使う）
- 全文検索したいとき（recall または search を使う）
- リアルタイムの情報が必要なとき（Web 検索を使う）

## Inputs

### Optional (いずれか1つ必須)

- entity: エンティティ名
- note-id: ノート ID
- query: 検索クエリ（エンティティ名で絞り込み）

### Options

- --timeline: 時系列ビューで表示
- --format: 出力フォーマット（plain / json / yaml、デフォルト: plain）
- --path: プロジェクトルートパス

## Usage

```bash
# エンティティ名で説明
knowledgine explain --entity "TypeScript" --path ~/notes

# 検索クエリから説明
knowledgine explain "TypeScript strict mode" --path ~/notes

# ノートIDから関連知識を展開
knowledgine explain --note-id 42 --path ~/notes

# 時系列ビューで表示
knowledgine explain --entity "TypeScript" --timeline --path ~/notes

# JSON 形式で出力
knowledgine explain --entity "TypeScript" --format json --path ~/notes
```

## Output Formats

| Format  | 説明                                          |
| ------- | --------------------------------------------- |
| `plain` | 人間が読みやすいテキスト（デフォルト）        |
| `json`  | 構造化 JSON（パイプ処理・スクリプト連携向け） |

## Best Practices

- まず `--entity` オプションで正確なエンティティ名を指定する
- エンティティ名が不明な場合は `[query]` 引数で検索する
- 来歴の経緯を時系列で確認したいときは `--timeline` を使う
- CI/スクリプトから利用する場合は `--format json` を使う
