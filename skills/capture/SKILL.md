---
name: capture
version: "0.1.0"
description: |
  What: 知識の即座取り込み
  When: 問題解決後、パターン発見時、学習事項の記録時
  How: knowledgine capture "content" or capture_knowledge MCP tool
---

## When to use
- 問題解決後の知見記録
- パターンやベストプラクティスの発見時
- 外部リソースからの学習事項

## When NOT to use
- 既にファイルとして存在する知識（ingestを使う）
- 一時的なメモ（ノートアプリを使う）

## Inputs
### Required
- content: 記録する知識の内容

### Optional
- title: タイトル
- tags: カテゴリタグ（カンマ区切り）
- url: 外部URL
- file: ファイルパス

## Best Practices
- 1つの知識 = 1つのcapture（複数の学びをまとめない）
- tags でカテゴリ分類（例: react, debugging, architecture）
- 具体的な問題と解決策をセットで記録
