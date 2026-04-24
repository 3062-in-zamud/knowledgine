# Tasks: KNOW-340 MCP Memory Protocol 参照実装

## Ticket ID

KNOW-340

## Prerequisites

- [x] Spec reviewed and approved (requirements.md + design.md) — PR 1 で確定
- [ ] Feature branch created per PR:
  - `docs/KNOW-340-protocol-gap-analysis` (PR 1)
  - `feat/KNOW-340-conformance-test-kit` (PR 2)
  - `fix/KNOW-340-protocol-compliance` (PR 3)
  - `docs/KNOW-340-implementation-guide-and-release-prep` (PR 4)
  - `feat/KNOW-340-protocol-examples` (PR 5)
- [x] 新規依存なし（確認済み）
- [ ] Migration 番号衝突なし（019/020 が未使用であることを確認済み）

## Implementation Tasks

### Phase 1 (PR 1): Gap analysis + SDD spec

- [ ] **Task 1.1**: `specs/KNOW-340-protocol-reference-implementation/requirements.md` 作成（本ファイル）
- [ ] **Task 1.2**: `specs/KNOW-340-protocol-reference-implementation/design.md` 作成
- [ ] **Task 1.3**: `specs/KNOW-340-protocol-reference-implementation/tasks.md` 作成（本ファイル）
- [ ] **Task 1.4**: `docs/mcp-memory-protocol-proposal/gap-analysis.md` 作成（仕様§3-§11 全要件を網羅）
- [ ] **Task 1.5**: `pnpm verify` ローカル緑
- [ ] **Task 1.6**: ブランチ push + PR 作成（develop target、draft → CI 緑で ready）

**PR 1 Definition of Done**:

- [ ] requirements.md / design.md / tasks.md が `specs/_templates/` 全セクション充足
- [ ] gap-analysis.md に §3-§11 全項目記載、Deferred 項目は fast-follow として列挙
- [ ] design.md に README / implementation-guide / gap-analysis の責務分離表を含む
- [ ] `pnpm verify` 緑、CI 緑

### Phase 2 (PR 2): Conformance test kit refactor

- [ ] **Task 2.1**: `packages/mcp-memory-protocol/src/types.ts` を更新（RecalledMemory に `deprecated` / `deprecationReason` / `supersedes` / `validFrom` 追加）
- [ ] **Task 2.2**: `packages/mcp-memory-protocol/src/schema.ts` を types.ts と整合させる
- [ ] **Task 2.3**: `packages/mcp-memory-protocol/src/conformance/index.ts` を `RunConformanceOptions` ベースに刷新
- [ ] **Task 2.4**: `packages/mcp-memory-protocol/src/conformance/helpers.ts` から MCP Client 依存を削除、Provider 直呼び helper に書き換え
- [ ] **Task 2.5**: 7 test-suite ファイル（store/recall/update/forget/versioning/error-format/capabilities）を describe/beforeEach パターンに書き換え
- [ ] **Task 2.6**: `packages/mcp-memory-protocol/tests/fake-provider.ts` 新規（Map ベース in-memory、capabilities `{ versioning: true, ttl: true, temporalQuery: false, semanticSearch: false, layerPromotion: false }`）
- [ ] **Task 2.7**: `packages/mcp-memory-protocol/tests/conformance-fake.test.ts` 新規（非 skip 全緑）
- [ ] **Task 2.8**: `packages/mcp-memory-protocol/tests/conformance-knowledgine.test.ts` 新規（`describe.skip` で保留、PR 3 で unskip）
- [ ] **Task 2.9**: `packages/mcp-memory-protocol/package.json` の `exports` に `./conformance` サブパス追加
- [ ] **Task 2.10**: `tsconfig.build.json` 確認（`dist/conformance/index.d.ts` emit）
- [ ] **Task 2.11**: 下流パッケージ（core/ingest/mcp-server/cli）のビルド破壊がないか確認。必要なら response shape 更新は PR 3 に送る（この PR では型追加のみで optional）
- [ ] **Task 2.12**: consumer-side 検証（`/tmp` で `pnpm add file:...` → `tsc --noEmit` + `node` 実行）
- [ ] **Task 2.13**: `pnpm verify` 緑
- [ ] **Task 2.14**: ブランチ push + PR 作成

**PR 2 Definition of Done**:

- [ ] `conformance-fake.test.ts` 非 skip で全 describe（store/recall/update/forget/versioning/error-format/capabilities）が 1 回以上 assertion 通過
- [ ] types.ts に deprecated/deprecationReason/supersedes/validFrom 追加、schema.ts と整合
- [ ] `pnpm --filter @knowledgine/mcp-memory-protocol build` で `dist/conformance/index.d.ts` 生成
- [ ] consumer-side: `import type { MemoryProvider } from '@knowledgine/mcp-memory-protocol'` + `import { runConformanceSuite } from '@knowledgine/mcp-memory-protocol/conformance'` が tsc --noEmit + node 実行で成功
- [ ] `pnpm verify` 全緑、CI 緑（Node 20/22）

### Phase 3 (PR 3): Compliance fixes (temporal_query + ttl)

#### 3-a: memory-adapter.ts バグ修正

- [ ] **Task 3.1**: `recall()` L132-135 の `includeVersionHistory` / soft-delete フィルタロジック修正（仕様§8.1 準拠）
- [ ] **Task 3.2**: `accessCount` インクリメントを `db.transaction(() => {...})` でラップ（defensive）
- [ ] **Task 3.3**: Pagination の count クエリと select クエリで WHERE 条件を同一化
- [ ] **Task 3.4**: `RecalledMemory` response shaping で `deprecated`/`supersedes`/`validFrom` を返す

#### 3-b: temporal_query 実装

- [ ] **Task 3.5**: `packages/core/src/storage/migrations/019_memory_valid_until.ts` 新規
- [ ] **Task 3.6**: `packages/core/src/index.ts` の `ALL_MIGRATIONS` に 019 追加
- [ ] **Task 3.7**: `memory-adapter.ts` `update(createVersion=true)` で旧 row の `valid_until` ← 新 row の `created_at` 設定
- [ ] **Task 3.8**: `memory-adapter.ts` `forget(soft)` で `deleted_at = now().toISOString()` を必ず記録（NULL にしない）
- [ ] **Task 3.9**: `memory-adapter.ts` `recall()` の asOf ブランチを実装（design.md の SQL + アプリ側 chain 集約）
- [ ] **Task 3.10**: `capabilities.temporalQuery = true`

#### 3-c: ttl 実装（lazy expire + 継承）

- [ ] **Task 3.11**: `packages/core/src/storage/migrations/020_memory_expires_at.ts` 新規
- [ ] **Task 3.12**: `packages/core/src/index.ts` の `ALL_MIGRATIONS` に 020 追加
- [ ] **Task 3.13**: `memory-adapter.ts` `store()` で `request.ttl` (秒) を受領し `expires_at` 計算
- [ ] **Task 3.14**: `memory-adapter.ts` `recall()`（asOf なし）で `(expires_at IS NULL OR expires_at > :now)` を count/select 両方に適用
- [ ] **Task 3.15**: `memory-adapter.ts` `update(in-place)` で expired 行に `MEMORY_NOT_FOUND`、ttl 明示指定時のみ expires_at 更新
- [ ] **Task 3.16**: `memory-adapter.ts` `update(versioned)` で expires_at 継承（旧→新コピー）、ttl 明示で上書き
- [ ] **Task 3.17**: `memory-adapter.ts` `forget()` で expired 行に `MEMORY_NOT_FOUND`
- [ ] **Task 3.18**: `capabilities.ttl = true`

#### 3-d: テストケース固定

- [ ] **Task 3.19**: asOf chain 重複排除テスト（v1→v2→v3 で asOf=v2.created_at → v2 のみ）
- [ ] **Task 3.20**: soft-delete + asOf 境界テスト（delete の 1ms 前の asOf で対象行返る）
- [ ] **Task 3.21**: `deleted=1 AND deleted_at IS NULL` 不整合データ防御テスト
- [ ] **Task 3.22**: TTL 継承テスト（ttl 省略で継承、明示で上書き、expired で MEMORY_NOT_FOUND）

#### 3-e: conformance unskip + docs

- [ ] **Task 3.23**: `packages/mcp-memory-protocol/tests/conformance-knowledgine.test.ts` を unskip し全緑確認
- [ ] **Task 3.24**: ルート `CLAUDE.md` の「Current max: 13」を「Current max: 20」に更新
- [ ] **Task 3.25**: `packages/core/CLAUDE.md` が存在すれば同期
- [ ] **Task 3.26**: `pnpm audit --audit-level=moderate --prod` 緑確認
- [ ] **Task 3.27**: `pnpm test:coverage` で 80% 以上確認
- [ ] **Task 3.28**: 既存 DB コピーで migration 019/020 ロールフォワード確認

**PR 3 Definition of Done**: `/Users/ren0826nosuke/.claude/plans/know-340-mcp-memory-flickering-gray.md` の Phase 3 DoD セクション参照

### Phase 4 (PR 4): Implementation guide + release prep

- [ ] **Task 4.1**: `docs/mcp-memory-protocol-proposal/implementation-guide.md` を拡充（Getting Started / Required endpoints / Optional endpoints / Error handling contract / Running conformance kit / minimal-provider walkthrough 参照）
- [ ] **Task 4.2**: `packages/mcp-memory-protocol/README.md` 刷新（位置付け、Install、Quick start、docs リンク、Jest 変換例、Examples プレースホルダー「PR 5 で追加予定」）
- [ ] **Task 4.3**: `packages/mcp-memory-protocol/package.json` に description/keywords/repository/homepage/bugs/files 追加（files に examples 含めない、version 不変）
- [ ] **Task 4.4**: `packages/mcp-memory-protocol/LICENSE` 作成（ルート LICENSE をコピー）
- [ ] **Task 4.5**: `packages/mcp-memory-protocol/CHANGELOG.md` 新規作成
- [ ] **Task 4.6**: `packages/mcp-memory-protocol/MIGRATION.md` 新規作成（旧→新 API diff 例、Jest 変換例）
- [ ] **Task 4.7**: ルート `CHANGELOG.md` `[Unreleased]` に `### Added` / `### Changed` セクション追記（見出しフォーマット `#### MCP Memory Protocol (\`@knowledgine/mcp-memory-protocol\`)`）
- [ ] **Task 4.8**: `pnpm --filter @knowledgine/mcp-memory-protocol pack --dry-run` で tarball 内容確認（dist/README.md/LICENSE/CHANGELOG.md/MIGRATION.md 含有、examples/tests/src/tsconfig 非含有、150 KB 未満）
- [ ] **Task 4.9**: 実 tarball を一時 dir で pnpm add + tsc --noEmit + node 実行で検証
- [ ] **Task 4.10**: README / implementation-guide に内部チケット番号が含まれないことを確認
- [ ] **Task 4.11**: `pnpm verify` + `pnpm audit --audit-level=moderate --prod` 緑確認

**PR 4 Definition of Done**: 計画書 Phase 4 DoD 参照

### Phase 5 (PR 5): examples (minimal-provider + knowledgine-provider)

- [ ] **Task 5.1**: `packages/mcp-memory-protocol/examples/minimal-provider/{package.json, tsconfig.json, src/index.ts, README.md, test.ts}` 作成
- [ ] **Task 5.2**: `packages/mcp-memory-protocol/examples/knowledgine-provider/{package.json, tsconfig.json, src/index.ts, README.md}` 作成
- [ ] **Task 5.3**: `pnpm-workspace.yaml` に `packages/mcp-memory-protocol/examples/*` 追加
- [ ] **Task 5.4**: 各 example の `package.json` に `workspace:*` 依存、`private: true`、`scripts` (test/build/typecheck)
- [ ] **Task 5.5**: 各 example の README に 30 秒セットアップ手順、workspace:\* 依存のため monorepo 内限定である旨の注記、「本番データ禁止」注記
- [ ] **Task 5.6**: PR 4 の README プレースホルダーを実 GitHub リンクに差し替え
- [ ] **Task 5.7**: `pnpm --filter "./packages/mcp-memory-protocol/examples/minimal-provider" test` 全緑
- [ ] **Task 5.8**: 各 example で `tsc --noEmit` 通過
- [ ] **Task 5.9**: pack --dry-run で examples/ が含まれていないこと確認
- [ ] **Task 5.10**: `pnpm verify` + CI 緑

**PR 5 Definition of Done**: 計画書 Phase 5 DoD 参照

## Verification Checklist（全 PR マージ時点で全 ✅）

- [ ] 全 Acceptance Criteria (AC-1 〜 AC-13) 達成
- [ ] 全テスト緑 (`pnpm test:run`、Node 20 + 22 CI)
- [ ] `pnpm verify` 緑
- [ ] `pnpm test:coverage` 80% 以上
- [ ] `pnpm audit --audit-level=moderate --prod` 緑
- [ ] 無関係な変更が PR に含まれない
- [ ] Conventional Commits（scope はパッケージ名）
- [ ] 各 PR で `.github/pull_request_template.md` に従って body 記入

## Housekeeping（全 PR マージ後）

- [ ] `~/workspaces/dev-butler/projects/knowledgine/tasks/MCP Memory Protocol参照実装.md` を `ticket_status: Done` に更新
- [ ] `~/workspaces/dev-butler/projects/knowledgine/docs/implementation-plan.md` の `- [x] #7 KNOW-340` にチェック
- [ ] Fast-follow 起票: `KNOW-340-followup-semantic-search-memory.md` / `KNOW-340-followup-v1-release.md` / (spec 曖昧点があれば) `KNOW-339-spec-ambiguities.md`

## Notes

- migration 番号は 019/020（ファイル名 019_memory_valid_until.ts / 020_memory_expires_at.ts、version 19/20）
- 公開 tarball に examples は **含めない**（workspace:\* 依存で monorepo 外からは動かないため）
- `package.json` の `version` は本チケットで **変更しない**（0.3.1 のまま）。別 release PR で v0.4.0 bump
- Conformance API は **clean break**（旧 MCP Client 方式は削除、MIGRATION.md で誘導）
- 各 PR は **単独で CI 緑で merge**（PR 2 で knowledgine conformance テストを skip するのはこのため）
