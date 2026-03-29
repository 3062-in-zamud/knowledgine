export const SKILL_MD = `---
name: knowledgine-feedback
version: "1.0.0"
lang: ja
description: >
  ナレッジベースの品質を向上させるために、誤った・欠落している・誤分類されたエンティティ抽出を
  報告します。存在すべきでないエンティティ（false_positive）、誤ったタイプに分類されたエンティティ
  （wrong_type）、または実在するが抽出されなかったエンティティ（missed_entity）を発見したときに
  呼び出してください。
---
# knowledgine-feedback

## 目的

エラーを報告することで、自動エンティティ抽出の品質を改善します。フィードバックは保存され、
抽出ルールの更新に適用できます。これにより、将来のインジェストで同じエラーが繰り返されることを防ぎます。

## 使用するタイミング

- **誤検出（false positive）を発見したとき** — 実際には固有表現ではないエンティティが
  抽出された場合（例：一般的な英単語が「technology」エンティティとして抽出された）
- **誤った分類（wrong type）を発見したとき** — エンティティは存在するが誤分類されている場合
  （例：「TypeScript」が「technology」ではなく「person」として分類されている）
- **見落とし（missed entity）を発見したとき** — 重要なエンティティがまったく抽出されなかった場合
  （例：頻繁に登場するライブラリ名にエンティティレコードがない）

## 使用しないタイミング

- エンティティ抽出の品質が許容範囲内のとき——軽微な不精確さは正常
- エンティティの重要性に関する主観的な意見の相違（エンティティが抽出されていないことが
  常に見落としを意味するわけではない——抽出器は信頼度閾値を使用している）

## 報告方法（MCPツール）

\`report_extraction_error\` MCPツールを使用します：

\`\`\`
report_extraction_error(
  entityName: string,      // ノートに記載されているエンティティ名
  errorType: "false_positive" | "wrong_type" | "missed_entity",
  entityType?: string,     // 現在のエンティティタイプ（wrong_type と false_positive の場合）
  correctType?: string,    // 正しいタイプ（wrong_type の場合）
  noteId?: number,         // 問題を確認したノートのID
  details?: string         // エラーに関する追加コンテキスト
)
\`\`\`

## 報告方法（CLIの代替手段）

\`\`\`bash
# 誤検出を報告
knowledgine feedback report \\
  --entity "the" \\
  --type false_positive \\
  --entity-type concept \\
  --details "Common English article incorrectly extracted as entity"

# 誤った分類を報告
knowledgine feedback report \\
  --entity "TypeScript" \\
  --type wrong_type \\
  --entity-type person \\
  --correct-type technology

# 見落としを報告
knowledgine feedback report \\
  --entity "Zod" \\
  --type missed_entity \\
  --details "Validation library used throughout packages/core but not extracted"
\`\`\`

## ステップバイステップの手順

1. **エラータイプを特定する** — 誤検出、誤った分類、見落としのどれか？
2. **エンティティ名を確認する** — 存在する場合は \`search_entities\` で正確な登録名を確認する
3. **ノートIDをメモする** — 特定のノートでエラーを確認した場合は、そのIDを記録する
4. **report_extraction_errorを呼び出す** — 該当するすべてのパラメータを含める
5. **送信を確認する** — ツールが成功レスポンスを返したことを確認する

## フィードバックの管理

\`\`\`bash
# 保留中のフィードバックを確認
knowledgine feedback list --status pending

# 特定のフィードバックを適用（管理者操作）
knowledgine feedback apply <id>

# フィードバックを適用せずに却下
knowledgine feedback dismiss <id>

# フィードバックの統計を確認
knowledgine feedback stats
\`\`\`

## ベストプラクティス

- 最初に高頻度のエラーを報告する——最も影響が大きい
- 抽出が誤りである理由について具体的な詳細を含める
- 可能な場合はノートIDを参照して、コンテキストからエラーを確認できるようにする
- 検索品質への実際の影響がない軽微なケースは報告しない

## 参照ファイル

- 各エラータイプの詳細な説明と例は \`error-types.md\` を参照
- 効果的なフィードバックレポートの書き方は \`feedback-guide.md\` を参照
`;
