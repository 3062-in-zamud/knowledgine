export const REFERENCES: Record<string, string> = {
  "capture-guide.md": `# キャプチャガイド

6つのキャプチャトリガータイプそれぞれの詳細ガイドです。

---

## 1. バグ修正

**タイミング**：欠陥を診断して解決したとき。

**含めるべき内容**：
- 正確なエラーメッセージまたは症状
- 根本原因（「壊れていた」だけでなく）
- 適用した修正
- 将来このバグを避ける方法

**例**：
\`\`\`
Problem: "Cannot read properties of undefined (reading 'id')" at user.ts:42.

Root cause: getUser() returned undefined when the database row did not exist, but the
caller assumed a non-null return value.

Fix: Added null check in getUser() and updated the return type to User | undefined.
Updated all callers to handle the undefined case.

Prevention: Avoid non-null assertions (!). Return undefined explicitly and propagate the
type to callers.
\`\`\`

タグ：\`bug-fix\`, \`typescript\`, \`null-safety\`

---

## 2. 設計判断

**タイミング**：代替案の中から一つのアーキテクチャまたは実装アプローチを選んだとき。

**含めるべき内容**：
- 行った判断（タイトルに簡潔にまとめる）
- 検討した選択肢
- 選択したアプローチ
- 理由とトレードオフ
- 判断を導いた制約

**例**：
\`\`\`
Decision: Use Zod for runtime API response validation instead of manual type guards.

Options considered:
A) Manual type guards — verbose, error-prone to maintain
B) Zod schema validation — declarative, generates TypeScript types automatically
C) io-ts — functional style, steep learning curve for the team

Chosen: Zod (option B). The automatic type inference reduces duplication between
runtime validation and TypeScript types. Team is already familiar with Zod from
form validation.
\`\`\`

タグ：\`design-decision\`, \`typescript\`, \`validation\`

---

## 3. パターン発見

**タイミング**：現在のファイルを超えて適用できる再利用可能なコードパターンを発見したとき。

**含めるべき内容**：
- パターン名（ある場合）
- パターンが解決する問題
- テンプレート/スケルトンコード
- どこで適用するか
- 注意事項や制限

**例**：
\`\`\`
Pattern: Repository layer with in-memory cache for read-heavy entities.

When to use: Entity reads are >10x more frequent than writes and data fits in memory.

Template:
  class CachedRepository<T> {
    private cache = new Map<string, T>();
    find(id: string): T | undefined { return this.cache.get(id); }
    store(id: string, entity: T): void { this.cache.set(id, entity); }
    invalidate(id: string): void { this.cache.delete(id); }
  }

Caveat: Cache must be invalidated on writes; not suitable for distributed deployments
without a shared cache layer.
\`\`\`

タグ：\`pattern\`, \`caching\`, \`architecture\`

---

## 4. トラブルシューティング

**タイミング**：問題を解決するために複数ステップの診断プロセスを経たとき。

**含めるべき内容**：
- 最初の症状
- 検証した仮説と結果
- 誤った方向性（他の人が繰り返さないように）
- 最終的な診断
- 解決手順

**例**：
\`\`\`
Symptom: knowledgine start fails with "SQLITE_ERROR: no such module: vec0" after
upgrading Node.js from 18 to 20.

Hypotheses tested:
- Reinstalled sqlite-vec package — no change
- Cleared node_modules and reinstalled — no change
- Downgraded back to Node 18 — resolved the issue

Diagnosis: Native module compiled for Node 18 ABI. Node 20 uses a different ABI
(NODE_MODULE_VERSION 115 vs 108).

Resolution: Run "npm rebuild" after upgrading Node.js to recompile native modules.
\`\`\`

タグ：\`troubleshooting\`, \`sqlite\`, \`native-modules\`, \`nodejs\`

---

## 5. 外部知識

**タイミング**：ドキュメント、記事、ブログ投稿、Stack Overflowからの知見を適用したとき。

**含めるべき内容**：
- ソースURLまたは参照
- 抽出した重要な知見
- このプロジェクトにどう適用したか
- このコードベース固有の注意事項

**例**：
\`\`\`
Source: https://nodejs.org/api/esm.html#esm_mandatory_file_extensions

Insight: In ESM (type: "module" in package.json), import paths MUST include the .js
extension even for TypeScript files. The TypeScript compiler emits .js extensions in
output but the source .ts files must reference .js for tsc to resolve them correctly.

Applied: Updated all internal imports in packages/cli/src to use .js extension.
\`\`\`

タグ：\`external-knowledge\`, \`esm\`, \`typescript\`

---

## 6. リファクタリング

**タイミング**：既存コードの構造や品質を改善したとき。

**含めるべき内容**：
- 修正前の問題点
- 変更した内容
- 達成した改善（可読性、パフォーマンス、保守性）
- リスクやトレードオフ

**例**：
\`\`\`
Before: Single 400-line setupCommand() function with nested conditionals handling all
target types inline.

After: Extracted per-target config builders into a TARGET_HANDLERS map. Each handler
is a pure function returning McpConfig. The main command orchestrates selection and
writing only.

Improvement: Adding a new target now requires only adding one entry to TARGET_HANDLERS
rather than editing the main function. Test coverage became straightforward.
\`\`\`

タグ：\`refactoring\`, \`architecture\`
`,

  "tag-taxonomy.md": `# タグタクソノミー

knowledgineの知識キャプチャ用標準タグ。1件のキャプチャにつき2〜5個のタグを使用します。
最も具体的なタグを選んでください。「code」や「misc」のような汎用的なタグは避けてください。

---

## 主要カテゴリタグ（1つ選択）

| タグ | 用途 |
|-----|---------|
| \`bug-fix\` | 根本原因分析を伴う欠陥の解決 |
| \`design-decision\` | 理由を持つアーキテクチャまたは実装の選択 |
| \`pattern\` | 再利用可能なコードまたは設計パターン |
| \`troubleshooting\` | 複数ステップの診断プロセス |
| \`external-knowledge\` | 外部ソース（ドキュメント、記事、SO）からの知見 |
| \`refactoring\` | コード品質の改善 |

## ドメインタグ（0〜3個選択）

### 言語 & ランタイム
| タグ | 用途 |
|-----|---------|
| \`typescript\` | TypeScript固有のパターン、型システム |
| \`javascript\` | JavaScript固有のパターン |
| \`nodejs\` | Node.jsランタイム、ネイティブモジュール、ESM |
| \`sql\` | SQLクエリ、スキーマ設計 |
| \`bash\` | シェルスクリプト、CLIツール |

### 品質 & 安全性
| タグ | 用途 |
|-----|---------|
| \`null-safety\` | null/undefinedの処理、オプショナルチェーン |
| \`type-safety\` | TypeScriptのstrictモード、型ガード |
| \`error-handling\` | エラー伝播、try/catchパターン |
| \`validation\` | 入力検証、スキーマ検証 |
| \`security\` | 認証、インジェクション防止、シークレット管理 |
| \`testing\` | テストパターン、テストユーティリティ、カバレッジ |

### アーキテクチャ
| タグ | 用途 |
|-----|---------|
| \`architecture\` | 高レベルの構造的判断 |
| \`api-design\` | REST、RPC、GraphQLインターフェース設計 |
| \`database\` | データベーススキーマ、マイグレーション、クエリ |
| \`caching\` | インメモリまたは分散キャッシュ |
| \`async\` | async/awaitパターン、並行処理 |

### インフラ & ツール
| タグ | 用途 |
|-----|---------|
| \`build\` | ビルドシステム、バンドラー設定 |
| \`ci-cd\` | CI/CDパイプライン、GitHub Actions |
| \`devops\` | デプロイ、インフラストラクチャーアズコード |
| \`dependencies\` | パッケージ管理、バージョンアップグレード |
| \`native-modules\` | Node.jsネイティブアドオン、ABI互換性 |
| \`esm\` | ESモジュール、import/export |
| \`performance\` | 最適化、プロファイリング、ベンチマーク |
| \`memory\` | メモリ管理、リーク検出 |

### プロジェクト固有
| タグ | 用途 |
|-----|---------|
| \`sqlite\` | SQLite、sqlite-vec、FTS5 |
| \`mcp\` | Model Context Protocolの統合 |
| \`embedding\` | ベクトル埋め込み、セマンティック検索 |
| \`entity-extraction\` | 固有表現認識、グラフ |
| \`ingest\` | 知識インジェストパイプライン |

---

## タグ付けの例

| シナリオ | タグ |
|----------|------|
| TypeScriptのnull参照エラーを修正 | \`bug-fix\`, \`typescript\`, \`null-safety\` |
| バリデーションにZodを使用することを決定 | \`design-decision\`, \`validation\`, \`typescript\` |
| ESMインポート拡張子パターンを発見 | \`external-knowledge\`, \`esm\`, \`nodejs\` |
| SQLite FTS5クエリを最適化 | \`performance\`, \`sqlite\`, \`database\` |
| コマンドハンドラ構造をリファクタリング | \`refactoring\`, \`architecture\` |
`,

  "format-examples.md": `# フォーマット例

適切にフォーマットされた知識キャプチャの具体的な例。

---

## 例1：バグ修正（TypeScript）

**タイトル**：Fix "object is possibly undefined" in KnowledgeRepository.getById

**タグ**：\`bug-fix\`, \`typescript\`, \`null-safety\`

**内容**：
\`\`\`
Problem: TypeScript error "object is possibly 'undefined'" when accessing note.id after
calling repository.getById(). The method signature returned Note | undefined but all
call sites assumed Note.

Root cause: The method was added when the codebase was less strict. The return type
correctly reflects that a record might not exist, but call sites were not updated.

Fix:
1. Updated all call sites to handle the undefined case explicitly:
   const note = repository.getById(id);
   if (!note) { throw new Error(\`Note \${id} not found\`); }
2. Added a getByIdOrThrow() helper for cases where undefined is a programming error.

Prevention: Avoid non-null assertions (!). Add repository methods with explicit error
semantics (OrThrow suffix) so callers choose their error handling strategy.
\`\`\`

---

## 例2：設計判断（アーキテクチャ）

**タイトル**：Use append-only markers in CLAUDE.md for knowledgine rules section

**タグ**：\`design-decision\`, \`architecture\`

**内容**：
\`\`\`
Decision: Wrap the injected rules section in HTML comment markers
<!-- knowledgine:rules:start --> and <!-- knowledgine:rules:end --> rather than
replacing the entire file or using a separate file.

Options considered:
A) Separate .knowledgine/RULES.md file — requires agent to know about the extra file
B) Replace entire CLAUDE.md — destroys user customizations on re-run
C) Append-only (no markers) — cannot update or remove without leaving duplicates
D) Marked section (chosen) — idempotent updates, preserves surrounding content

Chosen: Option D. The markers allow the CLI to find and replace exactly the
knowledgine section on subsequent runs while leaving user-written content intact.
This makes setup re-runnable and upgrade-safe.

Trade-off: If the user manually removes one marker, the update logic will break.
Documented in the README as a known limitation.
\`\`\`

---

## 例3：トラブルシューティング（ネイティブモジュール）

**タイトル**：sqlite-vec fails after Node.js major version upgrade — run npm rebuild

**タグ**：\`troubleshooting\`, \`sqlite\`, \`native-modules\`, \`nodejs\`

**内容**：
\`\`\`
Symptom: "Error: The specified module could not be found" (Windows) or
"invalid ELF header" (Linux) when loading sqlite-vec after upgrading Node.js.

Root cause: Native addons (.node files) are compiled against a specific Node.js ABI
version (NODE_MODULE_VERSION). Upgrading Node.js changes the ABI, making pre-compiled
binaries incompatible.

Diagnosis steps:
1. Confirmed error occurs only after Node upgrade, not on fresh install
2. Checked node-gyp output: "gyp info using node@20.x.x | ABI 115"
3. Found existing .node file compiled for ABI 108 (Node 18)

Resolution: Run \`npm rebuild\` (or \`pnpm rebuild\`) after every Node.js major version
upgrade. This recompiles all native modules for the current ABI.

For CI: Pin NODE_MODULE_VERSION in cache keys to avoid stale compiled artifacts.
\`\`\`

---

## 例4：パターン発見

**タイトル**：Pattern: early-return guard clauses to eliminate deep nesting

**タグ**：\`pattern\`, \`refactoring\`

**内容**：
\`\`\`
Problem: Functions with multiple validation steps produce deeply nested if/else blocks
that are hard to read and test independently.

Pattern: Use guard clauses (early returns) to validate preconditions at the top of the
function, keeping the happy path at the minimum indent level.

Before:
  function processNote(note: Note | undefined) {
    if (note) {
      if (note.content) {
        if (note.content.length > 0) {
          // actual logic here — 3 levels deep
        }
      }
    }
  }

After:
  function processNote(note: Note | undefined) {
    if (!note) return;
    if (!note.content) return;
    if (note.content.length === 0) return;
    // actual logic here — top level
  }

Applies to: Any function with multiple nullable inputs or precondition checks.
Caveat: When early returns have side effects (logging, metrics), make that explicit.
\`\`\`

---

## 例5：外部知識

**タイトル**：ESM requires .js extension in TypeScript import paths even for .ts source files

**タグ**：\`external-knowledge\`, \`esm\`, \`typescript\`, \`nodejs\`

**内容**：
\`\`\`
Source: https://www.typescriptlang.org/docs/handbook/esm-node.html

Insight: When compiling TypeScript to ESM (module: "NodeNext" or "ESNext" + type:
"module" in package.json), import paths MUST end in .js — not .ts — even when the
source file is .ts.

Reason: TypeScript does not rename import extensions at compile time. The runtime
(Node.js ESM loader) looks for .js files. TypeScript resolves .ts source files when
you write \`import foo from "./foo.js"\` — it knows that .js refers to the compiled .ts.

Applied to this project: All internal imports in packages/cli/src/ use .js extensions.
Forgetting this causes "Cannot find module" at runtime despite TypeScript compiling
successfully (because tsc resolves the type but Node.js cannot find the file).

Gotcha: \`import type\` paths also need .js extensions in strict ESM mode.
\`\`\`
`,
};
