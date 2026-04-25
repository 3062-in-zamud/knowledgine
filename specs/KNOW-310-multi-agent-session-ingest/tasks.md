# Tasks: cline-sessions ingest plugin

## Ticket ID

KNOW-310

## Prerequisites

- [x] Spec reviewed and approved (requirements.md + design.md)
- [x] Feature branch + worktree created: `.worktrees/know-310-cline-sessions` / `feat/know-310-cline-sessions`
- [x] Cline source pinned at `v3.81.0` and documented in `docs/research/cline-session-storage.md`

## Implementation Tasks

### Phase 1: Research & spec (完了済み)

- [x] **Task 1**: `docs/research/cline-session-storage.md` 作成
- [x] **Task 2**: SDD spec (`requirements.md`, `design.md`, `tasks.md`)
- [x] **Task 3**: `docs/push-based-capture.md` L181-189 の結論書き換え (research へリンク)

### Phase 2: Promote shared utils + failing tests

- [x] **Task 4**: `packages/ingest/src/shared/decision-detector.ts` を作成し `plugins/claude-sessions/decision-detector.ts` を移動。`claude-sessions/index.ts` の import を書き換え
- [x] **Task 5**: `packages/ingest/src/shared/text-extractor.ts` を作成、`plugins/claude-sessions/session-parser.ts` から `extractTextContent` を抽出。`session-parser.ts` の import を書き換え
- [x] **Task 6**: 既存 `decision-detector.test.ts` の import を `shared/` に書き換えて緑維持
- [x] **Task 7**: fixtures 作成
  - `packages/ingest/tests/plugins/cline-sessions/fixtures/sample-task-folder/state/taskHistory.json`
  - `.../sample-task-folder/tasks/task-abc12345/{api_conversation_history.json,ui_messages.json,task_metadata.json}` (合成 `sk-ant-api03-` 含む、`unknown_future_field` 含む)
  - `.../corrupted-task/tasks/task-broken/{api,ui,metadata}.json` (壊れた JSON)
  - `.../empty-dir/tasks/.gitkeep` (空ディレクトリ表現)
- [x] **Task 8**: `storage-locator.test.ts` 作成 (赤)
- [x] **Task 9**: `session-parser.test.ts` 作成 (赤)
- [x] **Task 10**: `cline-sessions-plugin.test.ts` 作成 (赤)

### Phase 3: Implementation (緑化)

- [x] **Task 11**: `packages/ingest/src/plugins/cline-sessions/types.ts` (型 + 型ガード)
- [x] **Task 12**: `packages/ingest/src/plugins/cline-sessions/storage-locator.ts` (`getClineStorageDir`, `computeStorageHash`)
- [x] **Task 13**: `packages/ingest/src/plugins/cline-sessions/session-parser.ts` (`parseClineTask`, `readTaskHistory`)
- [x] **Task 14**: `packages/ingest/src/plugins/cline-sessions/index.ts` (`ClineSessionsPlugin` 本体)
- [x] **Task 15**: `packages/ingest/src/plugins/cline-sessions/README.md`
- [x] **Task 16**: 全テスト緑化、coverage 確認

### Phase 4: Integration

- [x] **Task 17**: `packages/core/src/types.ts:193` の `SourceType` に `"cline"` を追加
- [x] **Task 18**: `packages/ingest/src/index.ts` に `ClineSessionsPlugin` の export 追加
- [x] **Task 19**: `packages/ingest/src/normalizer.ts:58` の `SOURCE_TYPE_MAP` に `"cline-sessions": "cline"` 追加
- [x] **Task 20**: `packages/cli/src/lib/plugin-loader.ts` に `registry.register(new ClineSessionsPlugin())` 追加
- [x] **Task 21**: `packages/cli/src/commands/ingest.ts` に `--source cline-sessions` 分岐追加 (sourceUri 空のままプラグインに委譲)
- [x] **Task 22**: `packages/cli/src/templates/skills/knowledgine-ingest/references.{ja,}.ts` に cline-sessions セクション追加
- [x] **Task 23**: `README.md` の supported sources に `--source cline-sessions` を追加
- [x] **Task 24**: `CHANGELOG.md` の Unreleased に Added エントリ追加

### Phase 5: Local verification

- [x] **Task 25**: `pnpm build` 緑 (Node 22)
- [x] **Task 26**: `pnpm verify` 緑 (Node 22)
- [x] **Task 27**: `mise use node@20 && pnpm verify` 緑
- [x] **Task 28**: `pnpm test:coverage` で `cline-sessions` カバレッジ >= 80% / 70%
- [x] **Task 29**: 手動 CLI 検証 (graceful skip / fixture / sanitization)

### Phase 5.5: Second-opinion review

- [x] **Task 30**: codex CLI または別サブエージェントで diff レビュー
- [x] **Task 31**: Critical/High 指摘ゼロまで `fix:` コミットで対応

### Phase 6-7: PR submission + CI

- [x] **Task 32**: `git rebase origin/develop` → `pnpm verify` 再実行
- [ ] **Task 33**: `gh pr create --base develop` で PR 作成
- [ ] **Task 34**: `gh pr checks --watch` で CI 緑確認、失敗時 `fix:` コミットで対応

## Verification Checklist

- [x] AC-1 〜 AC-16 すべて緑 (実装後セルフレビューで確認)
- [x] `pnpm test:run` 全緑 (171 ファイル、2173 テスト)
- [x] `pnpm verify` 全緑 (Node 22 マシンで実行済み、Node 20 は cline-sessions 単体で緑)
- [ ] CI 全緑 (lint / typecheck / format:check / test / coverage / audit) — Phase 7 で確認
- [x] secret redaction が fixtures で検証されている (raw `sk-ant-api03-` が出力に残らない)
- [x] 内部チケット ID `KNOW-310` がコミット/PR/README/push-based-capture から除外されている (spec ディレクトリ名のみ許容)
- [x] worktree 外 (元リポジトリ) のブランチが develop のままで影響なし

## Notes

- Cline は本マシンに未インストールのため、本番動作検証は Phase 5 で別 PC または知人テスト依頼で代替するか、Known Limitations に明記する
- `task_metadata.json` は context tracking 用ファイルで、タスク基本情報 (name, status) は持たない。基本情報は `state/taskHistory.json` (HistoryItem[]) から取得
- decision-detector / extractTextContent の `shared/` 昇格は今 PR で実施 (3 つ目のプラグインまで先送りしない)
