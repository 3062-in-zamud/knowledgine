export const REFERENCES: Record<string, string> = {
  "debrief-template.md": `# デブリーフテンプレート

セッションデブリーフのキャプチャを作成する際は、以下のテンプレートに記入してください。
該当しないセクションは省略してください。

---

\`\`\`markdown
## Session Debrief: <YYYY-MM-DD> — <主なトピック>

### 概要
<セッションの目標と結果を1〜2文で要約>

### 解決した問題
<!-- 重要な問題それぞれについて、根本原因と解決策を記載 -->
- **<問題のタイトル>**
  - Root cause: <原因>
  - Solution: <対処内容>
  - Files changed: <ファイルのリスト>

### 行った判断
<!-- アーキテクチャまたは実装上の判断とその理由を記載 -->
- **<判断のタイトル>**
  - Options considered: <A, B, C>
  - Chosen: <選択肢>
  - Reason: <理由>

### 発見したパターン
<!-- このセッションで発見した再利用可能な知見やパターン -->
- **<パターン名>**: <簡単な説明といつ適用するか>

### 変更したコード
<!-- 何をなぜ変更したかの概要 -->
| File | Change | Purpose |
|------|--------|---------|
| <path> | <created/modified/deleted> | <理由> |

### 未解決の疑問
<!-- 将来のセッションに向けた未解決の事項 -->
- <疑問点または不確実な点>
- <調査または判断が必要な事項>

### 参照
<!-- このセッションで参照した外部ソース -->
- <URLまたはドキュメントタイトル>
\`\`\`

---

## 使用上の注意

**タイトルフォーマット**："Session Debrief: 2026-03-15 — Entity extraction pipeline fix"

**タグ**：必ず \`debrief\` を含めること。主なトピック領域を追加する：
- \`debrief\`, \`bug-fix\` — 主にバグ修正のセッション
- \`debrief\`, \`design-decision\` — 設計が中心のセッション
- \`debrief\`, \`refactoring\` — リファクタリング中心のセッション
- \`debrief\`, \`feature\` — 新機能を追加したセッション

**最小限のデブリーフ**：時間が少ない場合は、最低限以下を記録する：
1. 何をしたか（タスクごとに1文）
2. 重要な判断または落とし穴
3. 未解決の疑問

**個別キャプチャ**：重大なバグや判断については、先に個別のキャプチャを作成し
（knowledgine-captureを使用）、デブリーフのサマリーでそれらを参照してください。
これにより、個別の知見がデブリーフを通じてだけでなく、タイプ別にも検索可能になります。
`,

  "example-output.md": `# デブリーフ出力例

適切に書かれたセッションデブリーフの具体的な例。

---

**タイトル**：Session Debrief: 2026-03-15 — ESM import resolution and sqlite-vec fix

**タグ**：\`debrief\`, \`bug-fix\`

**内容**：
\`\`\`markdown
## Session Debrief: 2026-03-15 — ESM import resolution and sqlite-vec fix

### 概要
Node.js 20へのアップグレードによって発生したビルド時の2つの障害を修正した。
CLIソースファイルにESMインポートの拡張子が欠落していた問題と、
sqlite-vecネイティブモジュールが新しいABI向けに再コンパイルが必要だった問題。

### 解決した問題

- **ESMインポートの.js拡張子が欠落**
  - Root cause: TypeScriptソースが拡張子なしのインポート（例：\`import foo from "./foo"\`）を
    使用していた。CommonJSでは動作するが、厳格なESMモード（Node 20 + type: "module"）では失敗する。
  - Solution: packages/cli/src/ と packages/core/src/ のすべての相対インポートに
    .js拡張子を追加した。tsconfig を moduleResolution: "NodeNext" に更新した。
  - Files changed: cli と core パッケージにまたがる約40ファイル

- **Node 20での sqlite-vec "invalid ELF header"**
  - Root cause: ネイティブ .node バイナリが Node 18 ABI（NODE_MODULE_VERSION 108）向けに
    コンパイルされていた。Node 20 は ABI 115 を使用する。
  - Solution: \`npm rebuild\` を実行して sqlite-vec を Node 20 向けに再コンパイルした。
    再発防止のために CI キャッシュキーに ABI バージョンチェックを追加した。
  - Files changed: ソース変更なし。CIワークフローを更新した。

### 行った判断

- **moduleResolution: NodeNext を恒久的に維持する**
  - Options: CommonJSに戻す、または NodeNext に更新する
  - Chosen: NodeNext。ESMはNode.jsが向かっている方向であり、巻き戻すとさらに移行の負債が積み上がる。
    .js拡張子の要件は一度限りのコストである。

### 発見したパターン

- **Node.jsメジャーアップグレード後の npm rebuild**：ネイティブモジュールを使用するプロジェクトは
  Node.jsのメジャーバージョンアップグレード後に必ず \`npm rebuild\` を実行する必要がある。
  アップグレードの手順書にこれを追加すること。
  関連：個別キャプチャ "sqlite-vec fails after Node.js upgrade" も参照。

### 変更したコード

| File | Change | Purpose |
|------|--------|---------|
| packages/cli/src/**/*.ts | modified | すべての相対インポートに .js を追加 |
| packages/core/src/**/*.ts | modified | すべての相対インポートに .js を追加 |
| tsconfig.json | modified | moduleResolution: NodeNext |
| .github/workflows/ci.yml | modified | キャッシュキーに NODE_ABI を追加 |

### 未解決の疑問

- .js拡張子を強制するコードモッドまたはlintルールはあるか？ESLint importプラグインが
  対応している可能性がある——将来の利用に向けて調査が必要。
- knowledgine initコマンドがABIの不一致をプロアクティブに検出すべきか？

### 参照

- https://www.typescriptlang.org/docs/handbook/esm-node.html
- https://nodejs.org/api/esm.html#mandatory-file-extensions
\`\`\`
`,
};
