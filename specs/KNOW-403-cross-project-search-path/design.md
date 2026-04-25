# Design: cross-project search dynamic path resolution

## Ticket ID

KNOW-403

## Architecture Overview

CLI 層に純粋関数 `resolveProjectArgs()` を追加し、`--projects` 引数の CSV を
「registered name」と「動的 path」に分類して `ProjectEntry[]` に解決する。
core 層は無変更（既存の `existsSync` 不在 skip / `schema_version >= 8` 検証で
動的 path 入力も透過的に処理可能）。

```
[Existing flow]                          [New flow]
--projects CSV                           --projects CSV
  │                                        │
  ├─ split ","                             ├─ resolveProjectArgs(arg, rcProjects)
  ├─ requestedNames Set                    │   ├─ for each entry:
  ├─ rcConfig.projects.filter(name)        │   │   ├─ isPathLike?
  └─ → ProjectEntry[]                      │   │   │   yes → expandAndResolvePath
        │                                  │   │   │           + .knowledgine check
        ▼                                  │   │   │           + dedupe Set
  CrossProjectSearcher                     │   │   │   no  → rcProjects lookup
        │                                  │   │   └─ slice(0, MAX_CONNECTIONS=10)
  各 project.path で                       │   └─ ResolveResult { resolved,
  .knowledgine/index.sqlite を open        │         unresolvedNames,
                                           │         unresolvedPaths,
                                           │         truncatedCount }
                                           │
                                           └─ Case A/B/C/D エラー or 検索実行
```

## Interface Definitions

```typescript
// packages/cli/src/lib/resolve-project-args.ts (新規)
import type { ProjectEntry } from "@knowledgine/core";

export interface ResolveResult {
  resolved: ProjectEntry[];
  unresolvedNames: string[]; // path-like でなく registered にも該当しない
  unresolvedPaths: string[]; // path-like だが .knowledgine/ 不在
  truncatedCount: number; // MAX_CONNECTIONS=10 超過分
}

export function resolveProjectArgs(
  rawArg: string,
  rcProjects: ReadonlyArray<ProjectEntry>,
  options?: { cwd?: string; homeDir?: string },
): ResolveResult;

// 内部関数 (isPathLike, expandAndResolvePath) は export しない
```

呼び出し側 (`packages/cli/src/commands/search.ts` 67-116 行付近):

```typescript
const rcConfig = loadRcFile(rootPath);
const result = resolveProjectArgs(options.projects, rcConfig?.projects ?? []);

if (result.resolved.length === 0) {
  // Case A/B/C/D 文言を出し分け（下記 Error Handling Matrix 参照）
  console.error(buildErrorMessage(options.projects, result, rcConfig));
  process.exitCode = 1;
  return;
}
if (result.truncatedCount > 0) {
  console.error(
    `${symbols.warning} truncated ${result.truncatedCount} project(s); ` +
      `max ${MAX_CONNECTIONS} supported.`,
  );
}
const searcher = new CrossProjectSearcher(result.resolved);
// ... 既存の検索ロジック
```

## Data Flow

1. CLI `--projects "<csv>"` を `searchCommand` が受領
2. `loadRcFile(rootPath)` で rc 設定取得（null 安全）
3. `resolveProjectArgs(csv, rcConfig?.projects ?? [])` を呼び出し
4. 内部で CSV を split、trim、empty 除外
5. 各 entry を `isPathLike()` で path / name に分類
   - path 判定: `path.isAbsolute(arg)` または `/^(\.\.?|~)(\/|\\|$)/.test(arg)`
6. path 形式: `expandAndResolvePath()` で `~/` を `homedir()` に置換 →
   `path.resolve(cwd, ...)` で絶対化 → `existsSync(.knowledgine/index.sqlite)` 確認
   - 存在 → `{ name: basename(resolvedPath) || resolvedPath, path: resolvedPath }`
     を resolved 配列に追加。dedupe Set で重複排除
   - 不在 → `unresolvedPaths` に追加
7. name 形式: rcProjects から `find(p => p.name === arg)`
   - hit → resolved に追加
   - miss → `unresolvedNames` に追加
8. resolved を `slice(0, MAX_CONNECTIONS=10)`、超過分は `truncatedCount`
9. CLI 層で `result.resolved.length === 0` 判定 → Case A/B/C/D 文言
10. 0 件でなければ既存 `CrossProjectSearcher.search()` 経路へ

## Key Design Decisions

### Decision 1: CLI 層のみで完結（core 無変更）

- **Chosen**: `resolveProjectArgs()` を CLI 層の純粋関数として切り出す
- **Alternatives considered**:
  - (i) core `CrossProjectSearcher` に動的 path 対応ロジックを持たせる
  - (ii) core で `ProjectEntry` を `dbPath` フィールド対応に拡張
- **Rationale**:
  - core は既に `path → DB パス組み立て → 不在 skip` を実装済み（行 33-37）
  - core を変更すると mcp-server / rest-server も影響範囲となり S サイズ超過
  - CLI 層に閉じることで MCP / REST は本ティケット Out of Scope を維持

### Decision 2: 純粋関数の切り出し（テスタビリティ）

- **Chosen**: `packages/cli/src/lib/resolve-project-args.ts` に純粋関数として切り出す
- **Alternatives considered**: `search.ts` 内で inline 実装
- **Rationale**:
  - search.ts は既に 320 行超で関心事が肥大化
  - 純粋関数化により FS モック不要・高速・脆くない単体テストが可能

### Decision 3: 動的判定基準（`isAbsolute || /^[.~](\/|\\|$)/`）

- **Chosen**: `path.isAbsolute(arg) || /^(\.\.?|~)(\/|\\|$)/.test(arg)` で path 判定
- **Alternatives considered**:
  - `path.isAbsolute(arg)` のみ
  - prefix リストを `["./", "../", "~/", "."]` で startsWith
- **Rationale**:
  - `./repo` `../sibling` `~/foo` `.` を path 認識する必要あり
  - Windows separator (`..\sibling`, `~\foo`) も best-effort 対応
  - regex 一発で簡潔・テストしやすい

### Decision 4: Name 規則（`basename(path.resolve(arg))`）

- **Chosen**: `basename(path.resolve(arg))`、空なら `path.resolve(arg)` 全体
- **Alternatives considered**:
  - 絶対パスそのもの
  - `path:` prefix 付与
- **Rationale**:
  - 出力 `[projectName] title` の視認性が最重要
  - フルパスは横幅圧迫、prefix は慣習なし
  - `path.resolve` 後 basename を取ることで trailing slash 正規化と統一
  - 同名 basename 衝突は Out of Scope（rc 登録で解消可能）

### Decision 5: 解決優先（path 判定 → path 解決のみ）

- **Chosen**: path-like と判定された arg は registered name lookup を行わない
- **Alternatives considered**: registered と path の両方検索
- **Rationale**:
  - ユーザーが `./` `~/` `/` を含めた時点で path 意図は明確
  - 同じ文字列が偶然 registered name として登録されているケースは異常
  - 防御的に path 優先することで予測可能性を保つ

### Decision 6: 重複 dedupe（Set による正規化済み path 排除）

- **Chosen**: 解決済み絶対 path を `Set` で dedupe
- **Rationale**: `--projects /abs/repo,/abs/repo` で同 DB を 2 回開いて結果重複を防ぐ

### Decision 7: MAX_CONNECTIONS=10 超過時の警告

- **Chosen**: CLI 層で stderr に warning、先頭 10 件のみ採用
- **Rationale**: core は silent に slice する（`cross-project-searcher.ts:28`）が、
  動的 path 受領で 11+ を渡すユースケースが増える可能性。UX 上明示的な警告が望ましい

### Decision 8: エラー文言を unresolved kind 別に分岐

- **Chosen**: Case A (全 path 不解決) / B (全 name 不解決) / C (混在) /
  D (空入力) の 4 文言で出し分け
- **Alternatives considered**: 単一文言で済ませる
- **Rationale**:
  - 既存の単一文言は path 失敗時に「絶対パスを渡せ」とヒントできない
  - kind 別に「次のアクション」を提示することで UX が改善

### Decision 9: `process.exitCode` と `return` のペア

- **Chosen**: `exitCode = 1` 設定後は必ず `return` を続ける
- **Rationale**: searchCommand は async で続く処理（DB open など）に流れるため、
  return 漏れは二重出力 / 別コードパス実行のリスク

### Decision 10: Windows サポート best-effort

- **Chosen**: regex で Windows separator (`\`) を許容するが、CI は Linux/macOS のみ
- **Rationale**: knowledgine は macOS/Linux 開発者向けであり Windows は将来対応。
  best-effort 判定で実害なく Windows ユーザーが path 引数を渡せる

### Decision 11: SemVer minor bump

- **Chosen**: 新挙動追加なので 0.6.x → 0.7.0
- **Rationale**: 既存挙動でエラー終了していた入力（絶対パス）を新たに受理する =
  新機能 = minor

### Decision 12: 内部関数の export 制限

- **Chosen**: `resolveProjectArgs` のみ export、`isPathLike` / `expandAndResolvePath`
  は同ファイル内テストで検証
- **Rationale**: API 表面を最小化し将来の互換性債務を避ける

### Decision 13: MCP / REST server スコープ

- **Chosen**: 本ティケット Out of Scope。`.describe()` に
  "(registered names only)" を 1 行追加して UX 整合のみ確保
- **Rationale**: CLI と MCP の同時改修は S サイズ（2 人日）に収まらない

### Decision 14: core 層 `name` 用途調査結果

- 調査箇所: `cross-project-searcher.ts:35,55,70` の 3 箇所
- すべて `console.warn` ログまたは `projectName` フィールド表示用のみ
- 動的 basename を name に採用しても副作用なし

## Error Handling Matrix

| Case                 | 条件                                  | stderr 文言                                                                                                                                                                   | stdout   | exitCode |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| A                    | 全 path-like だが解決不能             | `"No projects could be resolved from: {input}. Each path must contain '.knowledgine/index.sqlite'. Run 'knowledgine init --path <dir>' to create one."`                       | (none)   | 1        |
| B                    | 全 name-like だが rc 未登録           | `"No matching registered projects found for: {input}. Available: {names}. Register a project in .knowledginerc, or pass an absolute path like --projects /abs/path/to/repo."` | (none)   | 1        |
| C                    | 混在で全部解決失敗                    | `"Could not resolve any projects. Unregistered names: {n}. Invalid paths: {p}."`                                                                                              | (none)   | 1        |
| D                    | 入力が空白のみ / "," のみ             | `"--projects requires at least one name or path."`                                                                                                                            | (none)   | 1        |
| 部分解決 (truncated) | resolved > 0 かつ truncatedCount > 0  | warning 1 行 + 検索結果                                                                                                                                                       | 検索結果 | 0        |
| 部分解決 (path 不在) | resolved > 0 かつ unresolvedPaths > 0 | core warning + 検索結果                                                                                                                                                       | 検索結果 | 0        |
| 全成功               | resolved > 0、その他 0                | 検索結果のみ                                                                                                                                                                  | 検索結果 | 0        |

## Migration Strategy

N/A. 既存挙動の上位互換のため migration 不要。
データベーススキーマ変更なし。

## Security Considerations

- 任意 path 受領は core の `Database(dbPath, { readonly: true })` で write 不可
- SQL injection は core の `searchNotesWithRank` の prepared statement で防御
- path traversal は ad-hoc 探索目的なので意図的に許容（ユーザー自身の rights 範囲内）
- secret leak: `.knowledgine/index.sqlite` 不在の path は warning 1 行のみで内容に
  触れない

## Testing Strategy

- **Unit tests** (`tests/lib/resolveProjectArgs.test.ts`): 17 ケース
  - registered / 絶対 / 相対 / `~/` / 混在 / 優先順位 / 解決失敗 / 空白 /
    重複 / 超過 / Windows / fallback / sym link / 空入力 / `~user/`
- **Integration tests** (`tests/commands/search.test.ts`): 7 ケース
  - 動的 path E2E / 不在 path warning / 全失敗 / 混在 / rc=null /
    JSON 後方互換 / stdout-stderr 分離
- **Edge cases**: basename が空、trailing slash、CSV 内重複、MAX 超過

## Dependencies

- New dependencies: なし（Node 標準の `path`, `fs`, `os` のみ使用）
- Modified packages: `@knowledgine/cli`
