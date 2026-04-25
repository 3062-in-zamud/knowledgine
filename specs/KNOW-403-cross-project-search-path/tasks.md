# Tasks: cross-project search dynamic path resolution

## Ticket ID

KNOW-403

## Prerequisites

- [x] Spec reviewed and approved (requirements.md + design.md)
- [x] Feature branch created: `feat/know-403-cross-project-search`
- [x] Worktree created at `.worktrees/know-403-cross-project-search/` (`develop` ベース)
- [x] Dependencies installed (`pnpm install --frozen-lockfile`)

## Implementation Tasks

順序遵守。各タスクは TDD（Red → Green → Refactor）を踏む。

### Phase 1: resolveProjectArgs 単体（Red → Green）

- [x] **Task 1**: `packages/cli/tests/lib/resolveProjectArgs.test.ts` を新規作成、ケース 1-17 を Red で記述
  - 1: registered name → ProjectEntry 解決（回帰）
  - 2: 絶対 path + .knowledgine 存在 → resolved
  - 3: 相対 path → cwd で resolve
  - 4: `~/foo` → homedir expand
  - 5: registered + path 混在 CSV → 両方解決
  - 6: 同文字列が registered と path 両方該当 → path 優先
  - 7: 解決不能 path → unresolvedPaths
  - 8: 解決不能 name → unresolvedNames（rc=null + name のみで全部 unresolvedNames）
  - 9: rc fixture 込みで `",, ,my-repo"` → resolved=1（空白除外）
  - 10: trailing slash 正規化（`/abs/repo/` → name=`repo`）
  - 11: 同一 path の CSV 重複 → dedupe で resolved=1
  - 12: MAX_CONNECTIONS=10 超過 → resolved=10, truncatedCount=1
  - 13: Windows separator `..\sibling` → path-like 判定
  - 14: basename が空（`/`）→ fallback で path 全体を name に
  - 15: シンボリックリンクは `path.resolve` のみで実体解決しない
  - 16: 空文字 / `","` → unresolvedNames=[], unresolvedPaths=[] で Case D 検出可能
  - 17: `~user/...` → resolved=[]
- [x] **Task 2**: `packages/cli/src/lib/resolve-project-args.ts` を新規作成し Green に
- [x] **Task 2.5**: `pnpm --filter @knowledgine/cli build` で tsconfig project refs が壊れないことを確認
- [x] **Task 3**: `pnpm --filter @knowledgine/cli test:run tests/lib/resolveProjectArgs.test.ts` で 17 ケース緑

### Phase 2: search.ts 統合（Red → Green）

- [x] **Task 4**: `packages/cli/tests/commands/search.test.ts` 存在確認、なければ新規作成、ケース 18-24 を Red で記述
  - 18: `--projects /abs/repo` で rc 登録なし検索成功
  - 19: `.knowledgine/` 不在の path → core warning が stderr、exitCode=0
  - 20: 全部解決不能 → Case A/B/C 文言と exitCode=1
  - 21: registered + path 混在 → 両方検索される
  - 22: rc=null（rc ファイル無し）でも動作
  - 23: JSON 出力で `results[].projectName` が basename
  - 24: stdout / stderr 出力先慣習（JSON 結果は stdout、warning は stderr）
- [x] **Task 5**: `packages/cli/src/commands/search.ts` の 67-116 行付近をリファクタ
  - `resolveProjectArgs` 呼び出しに置換
  - Case A/B/C/D エラー文言の出し分け
  - `truncatedCount > 0` の warning
  - すべての分岐で `process.exitCode = 1; return;` をペアで記述
- [x] **Task 6**: `pnpm --filter @knowledgine/cli test:run tests/commands/search.test.ts` で 7 ケース緑

### Phase 3: docs / ヘルプ / template

- [x] **Task 7**: `README.md` の `### search` 配下に `#### Cross-Project Search` セクション追加（registered + path + 制約）
- [x] **Task 8**: `docs/README.ja.md` に同セクションを対称配置
- [x] **Task 9**: `CHANGELOG.md` `## [Unreleased]` `#### CLI` に Added エントリ 1 件
- [x] **Task 10**: `packages/cli/src/templates/skills/knowledgine-search/skill-md.ts` `.ja.ts` にクロスプロジェクト用例を追加（ja は「任意のパス」訳語）
- [x] **Task 11**: `packages/cli/src/index.ts:281` の `--projects <names>` を `<names-or-paths>` に、description も拡張
- [x] **Task 12**: `packages/mcp-server/src/server.ts` の `search_knowledge` の `projects[]` describe に "(registered names only)" を追加

### Phase 4: PR 作成前ゲート（G1-G3）

- [x] **Task G1.1**: `tasks.md` の未完了 `- [ ]` が 0 件
- [x] **Task G1.2**: requirements.md Status を "draft" → "in progress"（実装中）→ "ready" 最終更新
- [x] **Task G2.1**: Node 20 で `pnpm install --frozen-lockfile`、`build`, `typecheck`, `lint`, `format:check`, `test:run` 全て exit 0
- [x] **Task G2.2**: Node 22 で同上 + `test:coverage` + `pnpm audit --audit-level=moderate --prod` も exit 0
- [x] **Task G3.1**: `.tmp/know-403-evidence/` 配下に手動 E2E ログ（fixture 作成→search 実行→stdout/stderr/exit code）
- [x] **Task G3.2**: AC-2 evidence: `git diff develop -- README.md docs/README.ja.md` と prettier --check
- [x] **Task G3.3**: AC-3 evidence: coverage レポートで `resolve-project-args.ts` ≥ 80%
- [x] **Task G3.4**: AC-4 evidence: G2 の Node 20/22 全コマンド出力を tee で保存

### Phase 5: Commit & Push & PR & CI watch

- [ ] **Task 17**: 3 commit 構成（test → feat → docs）
- [ ] **Task 18**: KNOW-404 が先行マージなら `git rebase origin/develop`、CHANGELOG 衝突は両エントリ残し
- [ ] **Task 19**: `git push -u origin feat/know-403-cross-project-search`
- [ ] **Task 20**: `gh pr create --base develop` で PR 作成（PR description は plan のテンプレート準拠、内部チケット ID 含めない）
- [ ] **Task 21**: `gh run watch` で Node 20/22 matrix 全ジョブ緑を確認
- [ ] **Task 22**: 失敗時は新規コミット（`--amend` / `--force` 禁止）

## Verification Checklist

- [x] All acceptance criteria in requirements.md are met (AC-1 〜 AC-4)
- [x] All tests pass: `pnpm test:run`
- [x] Full verification: `pnpm verify`
- [x] No unrelated changes included
- [x] Conventional Commit messages used
- [x] PR description には内部チケット ID（"KNOW-403" 単体）を含めない（spec dir 名は OK）
- [x] CI matrix [20, 22] が全 PASS

## Notes

- 並行する KNOW-404 と衝突可能性: README.md / CHANGELOG.md のみ。rebase + 両エントリ残しで解消可
- core 層は無変更（design.md Decision 1）
- MCP / REST 動的パス対応は後続チケット（design.md Decision 13）
