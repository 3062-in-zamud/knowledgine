export const REFERENCES: Record<string, string> = {
  "search-strategy.md": `# 検索戦略

適切な検索モードの選択方法、コンテキストシグナルの抽出方法、
クエリ検索・コンテキストベースのサジェスト・グラフ走査を組み合わせた
効果的な検索ワークフローの構築方法。

---

## モードの選択

### キーワードモード

SQLite FTS5 全文検索を使用します。正確な単語を含むドキュメントに一致します。

**最適な用途**:
- 正確なエラーメッセージ（例: \`"SQLITE_ERROR: no such module: vec0"\`）
- 関数名や変数名（例: \`"capture_knowledge"\`, \`"KnowledgeRepository"\`）
- ファイルパス（例: \`"packages/core/src"\`）
- バージョン文字列や識別子

**制限事項**:
- 同義語には一致しない（"fix" は "resolve" に一致しない）
- 大文字小文字は区別しないが、単語境界には敏感
- 複数語のクエリではフレーズの順序が重要

**例**:
\`\`\`
search_knowledge(query: "ENOENT no such file or directory", mode: "keyword")
\`\`\`

### セマンティックモード

ベクトル埋め込みを使用して意味によって一致します。共通の単語がなくても関連するコンテンツを見つけます。

**最適な用途**:
- 概念的なクエリ（例: "認証エラーの処理方法"）
- 何を求めているかはわかるが正確な語句が不明な場合
- 特定のエラーメッセージなしにトピックを探索する場合
- 言語をまたいだ、または言い換えによる一致

**要件**:
- ナレッジベースが \`--semantic\` フラグで初期化されている必要がある
- 埋め込みが利用できない場合はキーワード検索にフォールバック

**例**:
\`\`\`
search_knowledge(query: "user authentication token expiry", mode: "semantic")
\`\`\`

### ハイブリッドモード

キーワードとセマンティックのスコアを組み合わせます。両モードの最良の結果を返します。

**最適な用途**:
- ファイルパス、タスクの説明、機能領域から導出されたコンテキストベースのクエリ
- 最も汎用的な探索
- どちらのモードが良いかわからない場合
- 正確な語句と概念を混在させた複雑なクエリ

**例**:
\`\`\`
search_knowledge(query: "TypeScript null safety database repository", mode: "hybrid")
\`\`\`

---

## コンテキストシグナルの抽出

特定の検索クエリがない場合は、現在の作業コンテキストからシグナルを抽出します。

### シグナルの種類

| シグナルの種類 | 入力例 | 抽出されるクエリ |
|----------------|--------|-----------------|
| ファイルパス | \`src/commands/setup.ts\` | \`"setup command configuration"\` |
| ファイルパス | \`packages/core/src/config/config-loader.ts\` | \`"config loader configuration"\` |
| ファイルパス | \`packages/ingest/src/plugins/github.ts\` | \`"github ingest plugin"\` |
| コンポーネント名 | \`SetupCommand\`, \`KnowledgeRepository\` | キーワードクエリとして直接使用 |
| タスクの説明 | "セットアップコマンドに TOML 設定ファイルのサポートを追加" | \`"TOML configuration setup"\` |
| タスクの説明 | "空のドキュメントに対するエンティティ抽出パイプラインを修正" | \`"entity extraction empty document"\` |
| エラーメッセージ | "SQLITE_ERROR: table entities has no column 'confidence'" | \`"SQLITE_ERROR entities column"\` |
| 機能領域 | MCP 設定 | \`"MCP server configuration"\` |
| 機能領域 | 検索 | \`"search_knowledge FTS5 semantic"\` |

### マルチシグナルクエリ

より絞り込んだ結果を得るために 2〜3 個のシグナルを組み合わせます:

\`\`\`
// ファイル + タスク
query: "config-loader TOML parsing"

// コンポーネント + 問題の種類
query: "KnowledgeRepository null safety"

// 技術 + パターン
query: "sqlite migration schema change"
\`\`\`

---

## ワークフローパターン

### パターン 1: セッション開始

既知の領域で作業を始めるとき:

1. 主要なファイルまたは機能領域からコンテキストを抽出する
2. 組み合わせたコンテキストクエリでハイブリッド検索を実行する
3. 上位 3〜5 件の結果を確認し、警告や過去の決定を記録する
4. 現在のファイルパスで \`find_related\` を使用して接続されたノートを発見する
5. 特定の問題が発生したら対象を絞ったキーワードクエリで進む

\`\`\`
// Step 1: コンテキストベースの検索
search_knowledge(query: "setup command MCP configuration", mode: "hybrid", limit: 10)

// Step 2: グラフの走査
find_related(filePath: "src/commands/setup.ts", limit: 5)
\`\`\`

### パターン 2: エラー発生時

エラーや例外が発生したとき:

1. 正確なエラーメッセージをコピーする
2. エラーメッセージでキーワード検索を実行する
3. 結果がなければ、エラーのキーとなる名詞を抽出して再試行する
4. それでも結果がなければ、症状の説明でセマンティック検索を試みる

\`\`\`
Error: "Cannot find module '@knowledgine/core'"
→ keyword: "Cannot find module @knowledgine/core"
→ keyword: "module resolution"
→ semantic: "TypeScript module not found build error"
\`\`\`

### パターン 3: 慣れないコードの探索

慣れないコンポーネントやモジュールに取り組むとき:

1. ファイルパスで検索: \`keyword: "src/commands/setup.ts"\`
2. コンポーネント名で検索: \`keyword: "setupCommand"\`
3. トピックで検索: \`semantic: "MCP configuration setup"\`
4. 関連する結果からグラフを走査: \`find_related(noteId: <id>, maxHops: 2)\`

### パターン 4: 変更を加える前に

アーキテクチャ上の決定や重要な変更を行う前に:

1. 過去の決定を検索: \`keyword: "design-decision <topic>"\`
2. 関連するパターンを検索: \`semantic: "<concept> pattern implementation"\`
3. 関連する noteId で \`find_related\` を使用して接続された決定を見つける

---

## 結果の解釈

### キーワードモード（BM25 スコア）

結果は BM25 関連性スコアで並べられています。高いほど良い；固定スケールはありません。
包括的なコンテキストを構築する場合以外は、上位 3〜5 件の結果に注目してください。

### セマンティックモード（コサイン類似度）

| スコア | 意味 |
|--------|------|
| > 0.9 | 非常に強い一致 — 関連性が高い可能性が高い |
| 0.7〜0.9 | 良い一致 — 適用可能性を確認 |
| 0.5〜0.7 | 弱い一致 — 関連する場合と関連しない場合がある |
| < 0.5 | 周辺的 — より良い結果がなければ通常スキップ |

### ハイブリッドモード

スコアは BM25 とコサイン類似度を組み合わせています。絶対値よりも相対的な順序を
複合シグナルとして扱ってください。

---

## find_related によるグラフ走査

最初の関連ノートを見つけた後、\`find_related\` を使って接続されたノートを発見します:

\`\`\`
// 検索結果から数値のノート ID を使用
find_related(noteId: 42, limit: 5, maxHops: 1)

// または現在のファイルパスで直接検索
find_related(filePath: "packages/core/src/config/config-loader.ts", limit: 5)
\`\`\`

**重要**: \`noteId\` は文字列ではなく数値（整数）でなければなりません。
\`search_knowledge\` の結果の \`id\` フィールドをそのまま使用してください。

**maxHops のガイダンス**:

| maxHops | 効果 |
|---------|------|
| 1 | 直接の参照のみ — 高速で焦点が絞られている（デフォルト） |
| 2 | 1 度の分離 — 探索に適している |
| 3 | より広いグラフ — オープンエンドな探索に使用 |
`,

  "query-tips.md": `# クエリのヒント

様々な状況に対応した効果的な検索クエリの作成方法、テンプレート、
フォールバック戦略、上限のガイダンス。

---

## 一般的な原則

1. **具体性が勝る** — 具体的なクエリは曖昧なクエリより優れている
   - 悪い例: \`"error"\`
   - 良い例: \`"TypeError cannot read properties of undefined"\`

2. **名詞と識別子を使用する** — 動詞や形容詞はノイズを増やす
   - 悪い例: \`"null のときに壊れたものをどう修正するか"\`
   - 良い例: \`"null check repository getById"\`

3. **エラーメッセージは宝の山** — キーワードモードではそのまま貼り付ける

4. **概念には自然言語を使う** — セマンティックモードでは状況を説明する
   - \`"what approach did we use for caching database results"\`

---

## 状況別クエリテンプレート

### エラーメッセージ
\`\`\`
// 正確なエラーメッセージをそのまま貼り付ける
keyword: "<exact error text>"

// 長すぎる場合は固有の部分を使用
keyword: "SQLITE_CONSTRAINT UNIQUE"
\`\`\`

### ファイルまたはコンポーネント
\`\`\`
keyword: "<拡張子なしのファイル名>"
keyword: "<ClassName> OR <functionName>"
\`\`\`

### 設計トピック
\`\`\`
semantic: "<component> architecture decision"
keyword: "design-decision <topic>"
\`\`\`

### 過去の問題
\`\`\`
semantic: "<症状の説明（平易な言葉で）>"
hybrid: "<technology> <problem noun>"
\`\`\`

### パターン検索
\`\`\`
keyword: "pattern <concept>"
semantic: "reusable pattern for <problem type>"
\`\`\`

### コンテキストベース（セッション開始またはファイルを開いたとき）
\`\`\`
// ファイル領域 + タスクを組み合わせる
hybrid: "<module-name> <task-noun>"

// 機能領域
hybrid: "<feature area> <technology>"
\`\`\`

---

## 最初のクエリで結果が得られなかったとき

以下のフォールバック戦略を順番に試みてください:

1. **クエリを広げる** — 具体的な識別子を削除し、名詞だけを残す
   - \`"SQLITE_ERROR: table notes has no column 'embedding'"\`
   - → \`"sqlite migration column"\`

2. **モードを切り替える** — キーワードが失敗したらセマンティックまたはハイブリッドを試み、
   セマンティックが失敗したらキーワードを試みる

3. **同義語クエリ** — 関連する語句を使用する
   - \`"authentication"\` → \`"auth session token login"\`

4. **タグベースのクエリ** — タグカテゴリで検索する
   - \`"bug-fix typescript"\`
   - \`"design-decision database"\`

5. **結果なしを受け入れる** — すべての問題が事前に記録されているわけではありません。
   解決した後、knowledgine-capture を使って解決策を記録してください。

---

## 上限のガイダンス

| 状況 | 推奨上限 |
|------|---------|
| クイックルックアップ（既知のトピック） | 3〜5 |
| 一般的な探索 | 10 |
| セッション開始時の完全なコンテキスト構築 | 15〜20 |
| レアなエントリを見つける | 20（デフォルト） |

\`search_knowledge\` のデフォルト上限は **20** です。クエリが正確な場合は
ノイズを避けるために低い上限を使用してください。\`find_related\` のデフォルト上限は
**5** です — これはほとんどのグラフ走査操作に適切です。

上限を大きくすると検索が若干遅くなります；クエリが正確な場合は低い上限を優先してください。
`,
};
