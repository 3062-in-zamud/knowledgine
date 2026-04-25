# KNOW-340: MCP Memory Protocol 参照実装（Reference Implementation）

## Ticket ID

KNOW-340

## Status

draft

## Problem Statement

KNOW-339 で `@knowledgine/mcp-memory-protocol` v0.3.1 の仕様ドラフト（`docs/mcp-memory-protocol-spec.md`、780 行、12 章＋付録 A-C）は完成した。仕様・提案ドキュメント群（`docs/mcp-memory-protocol-proposal/`）も揃っている。

しかし以下 4 点が未達のため、knowledgine は **MCP Memory Protocol の参照実装として成立していない**:

1. **仕様への完全準拠が未検証** — 仕様§3-§11 の全要件に対し、knowledgine 本体（`KnowledgineMemoryProvider` in `packages/mcp-server/src/memory-adapter.ts`）の実装状況が網羅的に評価されていない
2. **準拠テストスイートが他実装で使えない** — 既存 `packages/mcp-memory-protocol/src/conformance/` は MCP Client 前提で、他実装（Mem0/Zep 等）が import して自プロバイダーを検証する設計になっていない
3. **欠落機能がある** — `temporal_query` (asOf) / `ttl` capability 未実装、`recall()` の `includeVersionHistory` / soft-delete フィルタにバグ
4. **公開準備が不完全** — `package.json` 公開メタデータ（`description`/`keywords`/`repository`/`homepage`/`bugs`/`files`）欠落、`LICENSE` ファイル未同梱、`README.md` が参照実装の位置付けを反映していない

これらを解決することで knowledgine を「仕様 + 参照実装 + テストキット + 実装ガイド + 最小動作例」のワンストップ参照実装として完成させ、他メモリプロバイダーが互換実装を作る際の基盤を提供する。

## Acceptance Criteria

- [ ] AC-1: `docs/mcp-memory-protocol-proposal/gap-analysis.md` が仕様§3-§11 の全要件を網羅し、各要件に状態（✅/⚠/❌）と実装ファイルパスが紐づいている
- [ ] AC-2: `runConformanceSuite({ createProvider })` が `MemoryProvider` 差し込み式 API として `@knowledgine/mcp-memory-protocol/conformance` サブパスから import できる
- [ ] AC-3: knowledgine の `KnowledgineMemoryProvider` が `runConformanceSuite` で全緑（`versioning`/`temporal_query`/`ttl`/`layer_promotion` capability 有効化）
- [ ] AC-4: in-memory fake provider（`tests/fake-provider.ts`）と `examples/minimal-provider` が `runConformanceSuite` で全緑
- [ ] AC-5: 仕様§8.2 の Point-in-Time Recall（asOf）フィルタリングが実装され、soft-deleted 行でも `deleted_at > asOf` なら候補に含まれる
- [ ] AC-6: TTL 継承ルール（versioned update で旧 row の `expires_at` を新 row にコピー、ttl 省略で既存維持、ttl 明示で上書き、expired 行の update/forget は MEMORY_NOT_FOUND）が実装され、専用テストで固定
- [ ] AC-7: `docs/mcp-memory-protocol-proposal/implementation-guide.md` に「Hello World 手順」「Conformance kit 使用例」「Error handling contract」「Reference: minimal-provider walkthrough」が含まれる
- [ ] AC-8: `packages/mcp-memory-protocol/package.json` に `description` / `keywords` / `repository` / `homepage` / `bugs` / `files` が完備。`version` は 0.3.1 のまま維持（publish は別 release PR）。`files` に examples を含めない
- [ ] AC-9: `packages/mcp-memory-protocol/` に `LICENSE`（ルート LICENSE のコピー）、`CHANGELOG.md`、`MIGRATION.md`（新 API への移行ガイド）を配置
- [ ] AC-10: `pnpm verify` / `pnpm test:coverage`（80% 以上）/ `pnpm audit --audit-level=moderate --prod` がローカルおよび CI (Node 20 + 22 matrix) で全緑
- [ ] AC-11: `pnpm --filter @knowledgine/mcp-memory-protocol pack --dry-run` の tarball に `dist/` / `README.md` / `LICENSE` / `CHANGELOG.md` / `MIGRATION.md` が含まれ、`examples/` / `tests/` / `src/` / `tsconfig*` は含まれない。サイズ 150 KB 未満
- [ ] AC-12: monorepo 外の一時ディレクトリで tarball をインストールし、`import type { MemoryProvider } from '@knowledgine/mcp-memory-protocol'` + `import { runConformanceSuite } from '@knowledgine/mcp-memory-protocol/conformance'` が `tsc --noEmit` + `node` 実行の両方で成功
- [ ] AC-13: `examples/minimal-provider` / `examples/knowledgine-provider` が `tsc --noEmit` を通過し、workspace:\* 依存で monorepo 内で conformance 全緑

## Constraints

- **Performance**: TTL lazy expire のクエリオーバーヘッドが recall の p95 latency を 10% 以上悪化させないこと（専用 bench は追加しないが、既存 bench 低下を監視）
- **Compatibility**: 旧 `ConformanceTestContext` ベース API は **clean break で削除**（外部利用者は v0.3.x での先行利用が未確認のため）。MIGRATION.md で新 API へのコード diff 例を提供
- **Security**: `store_memory` のコンテンツはプリペアドステートメントで扱う（SQLi なし）。examples の README に「本番データを格納しないこと」を明記
- **Build Order**: mcp-memory-protocol → core → ingest → mcp-server → cli の順に伝播。mcp-memory-protocol の型変更は下流全パッケージの typecheck を通す必要がある
- **ESM only**: 相対 import は `.js` 拡張子、named export のみ
- **PR target**: `develop`。`main` 直接 merge 禁止
- **Commit scope**: パッケージ名を採用（`feat(mcp-memory-protocol):` / `fix(mcp-server):` / `feat(core):` / `docs(mcp-memory-protocol):`）
- **package.json `version` は触らない**: release workflow が `main` push + version bump で自動 publish するため、本チケットで version を上げると意図せず publish される
- **Migration 番号**: 現行 `packages/core/src/storage/migrations/` の最大 version は 18（016_note_confidence.ts）。新 migration は **019 / 020**（ファイル名・version 両方）を使用

## Affected Packages

- [x] `@knowledgine/core` — memory schema migration 019/020 追加、memory-manager.ts は必要時のみ
- [x] `@knowledgine/mcp-server` — `KnowledgineMemoryProvider` のバグ修正、asOf/ttl 実装、capabilities 更新
- [x] `@knowledgine/mcp-memory-protocol` — 新 conformance API、types.ts 拡張、公開メタデータ整備、examples
- [ ] `@knowledgine/cli` — 直接の変更なし（mcp-memory-protocol の型変更伝播でビルド影響のみ）
- [ ] `@knowledgine/ingest` — 直接の変更なし（同上）

## Out of Scope

- `semantic_search` capability（memory 層への embedding 付与）実装 — **fast-follow チケット起票**
- `@knowledgine/mcp-memory-protocol` v1.0.0 GA リリース / npm publish — **3 ヶ月 soak 後の別 release PR**
- MCP 仕様リポジトリ（modelcontextprotocol/modelcontextprotocol）への SEP PR 提出 — **事業系キャンセル済**
- Mem0 / Zep への互換性デモ作成 — **外部依存大、別タスク化**
- 旧 `ConformanceTestContext` API 用の deprecated 再 export — **clean break**
- cursor ベース pagination の追加 — **現仕様の `hasMore + totalCount` で十分、別チケット**

## Prior Art / References

- `docs/mcp-memory-protocol-spec.md` (v0.1-draft, 780 lines) — 仕様本体、§8.2 Point-in-Time Recall フィルタリングロジック含む
- `docs/mcp-memory-protocol-proposal/` — README / sep-draft / reference-impl / conformance-suite / implementation-guide / feedback-plan
- CHANGELOG.md v0.6.0 (2026-03-29) — `@knowledgine/mcp-memory-protocol` 初版 + conformance suite 追加時の記録
- Existing spec examples: `specs/KNOW-408-semantic-search-regression/`, `specs/KNOW-409-nonexistent-repo-crash/`
- `AGENTS.md` / `CONTRIBUTING.md` — commit scope / PR 規約 / coverage 80% 目標
- `.github/workflows/ci.yml` — Node 20/22 matrix、coverage、audit
- `.github/workflows/release.yml` — main push + version auto-publish
- `~/workspaces/dev-butler/projects/knowledgine/docs/implementation-plan.md` — 本チケットが execution_order #7
- `~/workspaces/dev-butler/projects/knowledgine/tasks/MCP Memory Protocol参照実装.md` — 元タスク定義
