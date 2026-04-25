# Tasks: env-var-style secret redaction completion

## Ticket ID

KNOW-401

## Prerequisites

- [x] Spec reviewed and approved (requirements.md + design.md)
- [x] Feature branch created: `fix/KNOW-401-secret-redaction-completion`
- [x] Worktree created at `.worktrees/know-401/` (`develop` ベース)
- [x] Dependencies installed (`pnpm install --frozen-lockfile`)

## Implementation Tasks

順序遵守。各タスクは TDD（Red → Green → Refactor）を踏む。

### Phase 1: Red（テスト先行）

- [x] **Task 1**: `packages/ingest/tests/secret-redaction.test.ts` に positive 12 件追加
  - KNOW-401 A: GITHUB_TOKEN / AWS_ACCESS_KEY_ID / SLACK_BOT_TOKEN / OPENAI_API_KEY / export DATABASE_URL / STRIPE_SECRET_KEY / 1 行 2 secrets（7 件）
  - KNOW-401 B: lower-case `github_token` / camelCase `databaseUrl`（2 件）
  - 追加 edge: idempotency / ReDoS / backtick（3 件）
- [x] **Task 2**: 同ファイルに negative 9 件追加（const TOKEN_REGEX / コメント / 散文 / tokenizer / 関数定義 / `//` コメント / passage / Markdown inline / process.env 参照）
- [x] **Task 3**: 既存テスト L54-69 / L83-103 / L107-135 に「変数名前半非含有」assertion を追記
- [x] **Task 4**: `packages/ingest/tests/normalizer.test.ts` に integration 1 件追加（`normalizeToKnowledgeEvent` 経由で `contentHash === sha256("[REDACTED]")`）
- [x] **Task 5**: `pnpm exec vitest run packages/ingest/tests/secret-redaction.test.ts packages/ingest/tests/normalizer.test.ts` で **新規 positive が fail** することを確認

### Phase 2: Green（実装）

- [x] **Task 6**: `packages/ingest/src/normalizer.ts` の `SECRET_PATTERNS` 配列の **先頭** に意図コメント + Pattern A (UPPER_SNAKE) + Pattern B (lower/camelCase) を追加
- [x] **Task 7**: vitest 再実行で **追加テスト + 既存 23 件すべて pass** を確認

### Phase 3: AC 全件動作確認 + plugin 影響確認

- [x] **Task 8**: AC-1〜AC-10 ごとに個別実行（`-t "KNOW-401"` filter）で全緑確認
- [x] **Task 9**: spot check script を `/tmp/know401-spot-check.mjs` に置き、代表 12 ケースで実出力が `[REDACTED]` になることを目視確認 → script 削除
- [x] **Task 10**: ingest 全 plugin テスト（gh-actions-parser / gh-parser / cursor-sessions / claude-sessions / obsidian / cicd / git-history 等）の regression なしを確認 — `pnpm --filter @knowledgine/ingest test:run` で 581/581 pass
- [x] **Task 11**: cli パッケージの test:run 実行（e2e は repo root から実行する CI と同等の環境で確認、worktree 単独実行時は path 仮定で fail するが既知）

### Phase 4: Spec 整備 / Full Verify

- [x] **Task 12**: `specs/KNOW-401-secret-redaction-completion/` に requirements.md / design.md / tasks.md を作成（`_templates/` 準拠）
- [ ] **Task 13**: `pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run test:run` を CI と同じ順序で個別実行
- [ ] **Task 14**: `pnpm verify` 一括実行
- [ ] **Task 15**: `pnpm test:coverage` でカバレッジ 80% を満たすことを確認
- [ ] **Task 16**: `pnpm audit --audit-level=moderate --prod`（CI の audit ジョブ相当）

### Phase 5: Commit & Push & PR

- [ ] **Task 17**: 単一コミット作成（Conventional Commits）
- [ ] **Task 18**: `git push -u origin fix/KNOW-401-secret-redaction-completion`
- [ ] **Task 19**: `gh pr create --base develop` で PR 作成

### Phase 6: CI 緑確認

- [ ] **Task 20**: `gh pr checks --watch` で Node 20/22 matrix の全ジョブ緑を確認
- [ ] **Task 21**: 失敗時は原因特定（`gh run view --log-failed`）→ 修正 → push を繰り返す

## Verification Checklist

PR 作成前に確認:

- [x] requirements.md AC-1〜AC-10 すべて満たす
- [ ] `pnpm test:run` 全件 pass（既知の flaky を除く）
- [ ] `pnpm verify` 緑
- [ ] No unrelated changes
- [x] Conventional Commit メッセージ準備済み（`fix(ingest): KNOW-401 ...`）

## Notes

- Pattern B の keyword alternation `[Tt]oken|[Ss]ecret|...` で 1 文字目の大小両対応にしたのは、camelCase 変数（`databaseUrl`, `apiKey`, `accessToken`）が大文字始まりキーワードを内包するため。lower-case 全文一致のみだと `databaseUrl` が match しない。
- 配列の先頭挿入は意図的。既存 L6 (`api_key|...`) や L22 (`SECRET|TOKEN|...`) が先に値部分のみ redact してしまうと、Pattern A/B が後で `GITHUB_[REDACTED]` の `[REDACTED]` に再 match することになり、順序依存設計になってしまう。先頭配置で「最も具体的な env-var 代入を最初に潰す」という意図を明示。
- `process.env.GITHUB_TOKEN` 参照（代入なし）は既存 L6 で redact されるが、これは KNOW-401 のスコープ外。テストでは「既存挙動 lock」として positive 寄りに記述。
- `tests/e2e/full-workflow.test.ts` は `process.cwd()` を仮定しており、worktree 単独 filter 実行で path が二重化して fail する既知の問題あり。CI は repo root から実行するので問題なし。
