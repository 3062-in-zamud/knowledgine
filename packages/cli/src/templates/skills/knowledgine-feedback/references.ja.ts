export const REFERENCES: Record<string, string> = {
  "error-types.md": `# エラータイプ

3つのエンティティ抽出エラータイプの説明と例。

---

## false_positive（誤検出）

**定義**：意味のある固有表現ではないエンティティが抽出された。
抽出システムが単語やフレーズを重要なエンティティとして誤って識別した。

**一般的な原因**：
- エンティティタイプとして抽出された一般的な英単語（例：技術として「Map」）
- 実在するエンティティではないコンテキスト固有の専門用語（例：概念として「Result」）
- エンティティ名の部分一致（例：「TypeScript」から「Type」が抽出される）

**例**：

| エンティティ | 抽出されたタイプ | 誤りの理由 |
|--------|---------------|----------------|
| "the" | concept | 一般的な冠詞で、エンティティではない |
| "Manager" | technology | 一般的なクラス名サフィックスで、製品ではない |
| "Error" | technology | 一般的なプログラミング用語で、特定のツールではない |
| "Result" | concept | どこでも使われる汎用的なプログラミング用語 |

**報告するタイミング**：
誤検出されたエンティティが検索結果に頻繁に現れて結果の品質を低下させている場合に報告する。
目立たないノートの1回だけの出現は報告する価値がないかもしれない。

**報告方法**：
\`\`\`
report_extraction_error(
  entityName: "Manager",
  errorType: "false_positive",
  entityType: "technology",
  details: "Generic class name suffix, not a specific technology product"
)
\`\`\`

---

## wrong_type（誤分類）

**定義**：実在する意味のあるエンティティが抽出されたが、誤ったタイプに分類された。
エンティティは存在して有効だが、誤って分類されている。

**一般的な原因**：
- 人名のように聞こえる技術名（例：「Rust」は姓と混同される可能性がある）
- 技術的な名前を持つ概念
- 一般的な単語と同じ名前を持つプロジェクトやツール

**例**：

| エンティティ | 誤ったタイプ | 正しいタイプ | 理由 |
|--------|-----------|--------------|--------|
| "TypeScript" | person | technology | プログラミング言語であり、人ではない |
| "Rust" | concept | technology | プログラミング言語 |
| "knowledgine" | concept | project | このプロジェクトの名前 |
| "Jest" | person | technology | JavaScriptテストフレームワーク |

**報告するタイミング**：
誤った分類によりエンティティが無関係な検索に現れたり、
正しいエンティティタイプのクエリに現れなくなったりする場合に報告する。

**報告方法**：
\`\`\`
report_extraction_error(
  entityName: "TypeScript",
  errorType: "wrong_type",
  entityType: "person",
  correctType: "technology",
  details: "TypeScript is a programming language, not a person's name"
)
\`\`\`

---

## missed_entity（見落とし）

**定義**：重要なエンティティがまったく抽出されなかった。エンティティはナレッジベースの
ノートに存在するが、グラフにエンティティレコードがない。

**一般的な原因**：
- このエンティティに対してエンティティ抽出の信頼度閾値が高すぎた
- エンティティ名が通常とは異なる形式やコンテキストで言及されていた
- エンティティが新しく、抽出器のモデルがそれについて学習されていない
- エンティティが散文ではなくコードブロック内に現れている

**例**：
- バリデーションコード全体で「Zod」が言及されているがエンティティが抽出されていない
- コミットメッセージに現れるチームメンバーの名前がエンティティグラフにない
- 頻繁に参照される特定のエラーコード（例：「SQLITE_CONSTRAINT_UNIQUE」）
- importステートメントにのみ現れるライブラリ名

**報告するタイミング**：
\`search_entities\` または \`get_entity_graph\` でそのエンティティを検索するほど重要な場合に報告する。
頻度の低いマイナーなエンティティは追加する価値がないかもしれない。

**報告方法**：
\`\`\`
report_extraction_error(
  entityName: "Zod",
  errorType: "missed_entity",
  details: "Validation library used throughout packages/core for schema validation. \
Appears in imports and error messages but no entity was extracted."
)
\`\`\`
`,

  "feedback-guide.md": `# フィードバックガイド

抽出の改善につながる効果的なフィードバックレポートの書き方。

---

## 効果的なフィードバックの条件

良いフィードバック：
1. **具体的なエンティティを特定する** — 説明ではなく正確な名前
2. **正しい分類を述べる** — どのタイプであるべきか、またはあるべきでないか
3. **理由を説明する** — 簡潔な理由付けがフィードバックを実行可能にする
4. **ノートを参照する** — 問題が確認された場所へのリンク（可能な場合）

---

## フィードバック報告のワークフロー

### ステップ1：問題を特定する

\`search_entities\` を使って対象のエンティティを探す：
\`\`\`
search_entities(query: "TypeScript", limit: 5)
\`\`\`

返されたタイプと期待するものを照合する。

### ステップ2：関連するノートを探す（任意だが有用）

特定のノートでエンティティの誤分類を確認した場合は、そのIDをメモする。
ノートIDはsearch_knowledgeの結果で確認できる。

### ステップ3：報告する

利用可能なすべての情報を含めて \`report_extraction_error\` を呼び出す：
\`\`\`
report_extraction_error(
  entityName: "<exact name>",
  errorType: "<false_positive|wrong_type|missed_entity>",
  entityType: "<current type if known>",
  correctType: "<correct type for wrong_type errors>",
  noteId: "<note id if available>",
  details: "<1〜2文の説明>"
)
\`\`\`

### ステップ4：送信を確認する

ツールがフィードバックIDを含む成功レスポンスを返したことを確認する。
後でフィードバックの状態を追跡したい場合はIDをメモしておく。

---

## detailsフィールドの書き方

\`details\` フィールドは効果的なフィードバックで最も重要な部分。以下を含める：

- エンティティが実際に何であるか（名前だけで明確でない場合）
- 抽出されたタイプがなぜ誤りなのか
- エンティティがどのくらいの頻度で現れるか（見落としの場合）
- 抽出器の改善に役立つコンテキスト

**弱い詳細**：
\`\`\`
details: "wrong"
details: "this is not right"
\`\`\`

**強い詳細**：
\`\`\`
details: "Zod is a TypeScript-first schema validation library. It appears in ~20 notes
under packages/core/src as imports and in error messages but was not extracted. It
should be classified as 'technology'."
\`\`\`

---

## 何を報告するかの優先順位

| 優先度 | 基準 |
|----------|----------|
| 高 | エンティティが多くのノートに現れる；誤分類が検索結果を汚染している |
| 高 | 見落とされたエンティティがプロジェクトドメインの中心である |
| 中 | 誤検出が頻繁に現れるが、大きな害を与えていない |
| 低 | 検索品質への影響が軽微な1回限りの問題 |

---

## 報告後の対応

フィードバックの状態を確認し、改善を適用する：

\`\`\`bash
# 保留中のフィードバックを一覧表示
knowledgine feedback list --status pending

# フィードバック品質の統計を確認
knowledgine feedback stats
\`\`\`

適用されたフィードバックは抽出設定を更新し、将来のインジェストがより良い結果を生成します。
却下されたフィードバックは記録されますが、変更は行われません。
`,
};
