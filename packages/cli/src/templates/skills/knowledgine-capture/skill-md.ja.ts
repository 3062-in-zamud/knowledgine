export const SKILL_MD = `---
name: knowledgine-capture
version: "1.0.0"
lang: ja
description: >
  問題を解決したり、設計上の判断を行ったり、再利用可能なパターンを発見した後に、
  ローカルナレッジベースへ知識を記録します。バグを修正した直後、アーキテクチャの選択をした後、
  再利用可能なパターンを発見した後、外部ソースから学んだ後、またはリファクタリングを完了した後に
  呼び出してください。コンテキストが新鮮なうちに記録することで、セッション間の知識喪失を防ぎます。
---
# knowledgine-capture

## 目的

現在のセッションで得た貴重な学びをローカルナレッジベースに保存し、
将来のセッションやチームメンバーが参照できるようにします。
ナレッジベースは記録された内容だけが価値を持ちます。

## 使用するタイミング

セッション中に以下の**いずれかの**イベントが発生したときに知識をキャプチャします：

1. **バグ修正** — 根本原因を特定し、解決策を適用した
2. **設計判断** — 理由を持って複数の選択肢から一つのアプローチを選んだ
3. **パターン発見** — 他の場所でも適用できる再利用可能なパターンを見つけた
4. **トラブルシューティング** — 非自明な診断プロセスを経て問題を解決した
5. **外部知識** — ドキュメント、記事、Stack Overflowなどから得た知見を適用した
6. **リファクタリング** — 明確なビフォー・アフターを持つ形で既存コードを改善した

## 使用しないタイミング

- 移転可能な知見を含まない些細な編集（誤字修正、フォーマット変更など）
- 再利用価値のない、プロジェクト固有の一回限りの変更
- 重複エントリ：まず \`search_knowledge\` で既存の知識を検索してください

## キャプチャ方法（MCPツール）

\`capture_knowledge\` MCPツールを使用します：

\`\`\`
capture_knowledge(
  content: string,   // 完全な説明：問題 + 解決策 + コンテキスト
  title?: string,    // 短い説明的なタイトル（最大約80文字）
  tags?: string[],   // 標準タクソノミーから2〜5個のタグ
  source?: string    // 任意：URL、ファイル名、または参照元
)
\`\`\`

## キャプチャ方法（CLIの代替手段）

\`\`\`bash
knowledgine capture add "<content>" --title "<title>" --tags "<tag1>,<tag2>"
\`\`\`

## コンテンツフォーマット

各キャプチャは3つのパートで構成します：

1. **問題 / コンテキスト** — この学びのきっかけとなった状況は何か？
2. **解決策 / 判断** — 何をどのように行ったか？
3. **理由 / 備考** — なぜこのアプローチを選んだか？どんな代替案を検討したか？

例：
\`\`\`
**Problem**: TypeScript threw "Type 'unknown' is not assignable to type 'User'" when
parsing API response.

**Solution**: Added a type guard function isUser(val: unknown): val is User that checks
for required fields before narrowing the type.

**Rationale**: Using 'as User' cast was unsafe because the API response structure could
change. The type guard provides runtime validation and compile-time safety.
\`\`\`

## ステップバイステップの手順

1. **トリガーを特定する** — 6つのキャプチャイベントのどれが発生したか？
2. **内容を下書きする** — 問題 + 解決策 + 理由を平文で書く
3. **タイトルを選ぶ** — 簡潔で検索しやすいもの（動詞か名詞句で始める）
4. **2〜5個のタグを選ぶ** — 標準タクソノミーを使用する（capture-guide.md参照）
5. **capture_knowledgeを呼び出す** — content、title、tags、任意のsourceを渡す
6. **確認する** — ツールが成功レスポンスを返したことを確認する

## ベストプラクティス

- イベント直後に記録する——詳細が新鮮なうちに
- このセッションのコンテキストを持たない将来の読者を想定して書く
- 大きなまとめエントリより、一つの知見に集中した記録を優先する
- エラーメッセージはそのまま含める——最も効果的な検索ワードになる
- タグは正確に選ぶ：「misc」のような広いタグは発見性を下げる

## 参照ファイル

- 各トリガータイプの詳細ガイドと例は \`capture-guide.md\` を参照
- 標準タグカテゴリは \`tag-taxonomy.md\` を参照
- 具体的なキャプチャ例は \`format-examples.md\` を参照
`;
