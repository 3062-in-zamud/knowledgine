export const REFERENCES: Record<string, string> = {
  "entity-types.md": `# エンティティの種類

knowledgine がナレッジベースのコンテンツから認識・抽出するエンティティの種類。

---

## コアエンティティの種類

| 種類 | 説明 | 例 |
|------|------|-----|
| \`technology\` | ライブラリ、フレームワーク、ツール、言語 | \`SQLite\`, \`TypeScript\`, \`Node.js\`, \`Zod\` |
| \`concept\` | 抽象的なアイデア、パターン、アーキテクチャの概念 | \`caching\`, \`ESM\`, \`FTS5\`, \`semantic search\` |
| \`project\` | プロジェクト、リポジトリ、製品 | \`knowledgine\`, \`claude-code\` |
| \`person\` | 著者、コントリビュータ、連絡先 | チームメンバー、外部コントリビュータ |
| \`component\` | コードコンポーネント、クラス、モジュール | \`KnowledgeRepository\`, \`IngestEngine\` |
| \`command\` | CLI コマンドまたは API オペレーション | \`knowledgine init\`, \`capture_knowledge\` |
| \`file\` | ソースファイルとパス | \`packages/core/src/config/config-loader.ts\` |
| \`error\` | 名前付きエラー型またはエラーメッセージ | \`SQLITE_CONSTRAINT\`, \`ENOENT\` |

---

## エンティティの検索

### 正確な名前で
\`\`\`
search_entities(query: "SQLite")
search_entities(query: "KnowledgeRepository")
\`\`\`

### 種類 + 名前で
\`\`\`
search_entities(query: "technology sqlite")
search_entities(query: "concept caching")
\`\`\`

### 部分的な名前で
\`\`\`
search_entities(query: "Knowledge")  // KnowledgeRepository, knowledgine などに一致
\`\`\`

---

## エンティティ抽出の品質

エンティティはNLPを使用してノートのコンテンツから自動的に抽出されます。品質は
ノートの明確さに依存します。欠落または不正確なエンティティに気づいた場合は、
\`knowledgine-feedback\` を使用して報告してください。

**よくある抽出の問題**:
- 略語（TS → TypeScript がリンクされない場合がある）
- クラス名と同じ一般的な単語（Table, Manager）
- 一部のみが捕捉されるマルチワードエンティティ

---

## 探索のためのエンティティの活用

エンティティはナレッジグラフのナビゲーションハブとして機能します。\`SQLite\` のような
技術エンティティは SQLite に言及するすべてのノートに接続されており、エンティティから
関連するすべてのバグ修正、設計上の決定、パターンへと移動できます。

**探索パターン**:
\`\`\`
1. search_entities(query: "SQLite") → エンティティ ID（数値）を取得
2. get_entity_graph(entityId: 123) → すべての接続を確認
3. find_related(noteId: 456) → 外側に向かって走査
\`\`\`
`,

  "graph-navigation.md": `# グラフナビゲーション

\`get_entity_graph\` と \`find_related\` を使ってナレッジグラフを効果的に走査する方法。

---

## ナレッジグラフの構造

ナレッジグラフには 2 種類のノードがあります:

- **ノート** — 個々の知識エントリ（バグ修正、決定、パターンなど）
- **エンティティ** — ノートから抽出された名前付きの事物（技術、概念、人物）

**エッジの種類**:
- ノート → エンティティ: 「このノートはこのエンティティに言及している」
- エンティティ → ノート: 「このエンティティはこれらのノートに登場する」
- ノート → ノート: 「これらのノートはエンティティを共有している」（エンティティの接続を通じた暗示的なもの）

---

## get_entity_graph

エンティティと、それが登場するすべてのノート、さらに関連エンティティを返します。

\`\`\`
get_entity_graph(entityId: 123)
// 戻り値: { entity, notes: [...], relatedEntities: [...] }

get_entity_graph(entityName: "SQLite")
// 名前でエンティティを検索してからグラフを返す
\`\`\`

**以下のときに使用**:
- 特定の技術や概念に関するすべてのノートを確認したい
- このエンティティと共に登場する他のエンティティを発見したい
- より深い走査を行う前に概要を把握したい

---

## find_related

共有エンティティを通じて、出発点（ノートまたはファイルパス）に関連するノートを返します。

\`\`\`
find_related(noteId: 456, limit: 10, maxHops: 2)
find_related(filePath: "src/commands/setup.ts", limit: 10)
\`\`\`

**パラメータ**:
- \`noteId\`（数値）または \`filePath\`: 走査の出発点
- \`limit\`: 返すノートの最大数（デフォルト 5）
- \`maxHops\`: 許可するエッジ走査のステップ数（1〜3、デフォルト 1）

### maxHops ガイド

| maxHops | 意味 | 使用するタイミング |
|---------|------|-----------------|
| 1 | 出発ノートと直接エンティティを共有するノートのみ | デフォルト、焦点を絞ったルックアップ |
| 2 | 2 ホップ離れたノート（1 ホップのノートとエンティティを共有） | より広い探索 |
| 3 | 3 ホップ離れたノート | オープンエンドの探索、大きなグラフ |

**maxHops を大きくするほど結果が増えるが、平均的な関連性は低くなります。** 1 から始め、
結果が疎すぎる場合にのみ増やしてください。

---

## ナビゲーションパターン

### パターン 1: 技術の詳細調査

\`\`\`
// ナレッジベースにある TypeScript に関するすべてを理解する
1. search_entities(query: "TypeScript") → { id: 42, name: "TypeScript" }
2. get_entity_graph(entityId: 42)
   → 15 件のノートが TypeScript に言及
   → 関連エンティティ: ESM, tsconfig, type-safety
3. find_related(noteId: <上位ノートの id>, maxHops: 2)
   → 隣接するノートを提示
\`\`\`

### パターン 2: コンポーネントの歴史

\`\`\`
// セットアップコマンドの歴史を理解する
1. search_entities(query: "setupCommand") → エンティティ
2. get_entity_graph(entityId: <id>) → setupCommand に関するノート
3. design-decision とリファクタリングのノートをフィルタリング
4. 時系列順に読んで変遷を理解する
\`\`\`

### パターン 3: 領域をまたいだ接続

\`\`\`
// 2つのコンポーネント間の接続を見つける
1. get_entity_graph(entityName: "IngestEngine") → ノート + エンティティのセット A
2. get_entity_graph(entityName: "KnowledgeRepository") → セット B
3. relatedEntities の重複を調べてブリッジを見つける
\`\`\`

---

## 結果の解釈

\`get_entity_graph\` が多くのノートを返す場合、タグで優先順位を付けます:

| 優先度 | タグ |
|--------|------|
| 高 | \`design-decision\`, \`bug-fix\`, \`troubleshooting\` |
| 中 | \`pattern\`, \`refactoring\`, \`external-knowledge\` |
| 低 | タグなしのノート |
`,
};
