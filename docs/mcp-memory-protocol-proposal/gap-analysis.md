# MCP Memory Protocol Gap Analysis — Knowledgine Reference Implementation

## 概要

本ドキュメントは `docs/mcp-memory-protocol-spec.md` (v0.1-draft, 780 行) の全要件に対する knowledgine 本体の実装状況を評価し、参照実装として成立させるための欠落点と対処方針を明示する。KNOW-340 の Phase 1 成果物。

### 凡例

- **✅** — 実装済みかつ仕様に準拠
- **⚠** — 部分実装、バグ、または仕様との乖離あり
- **❌** — 未実装
- **Deferred** — 本チケット範囲外（別チケット起票済みまたは予定）

### 状態サマリー

| カテゴリ                                   | ✅  | ⚠   | ❌  | Deferred |
| ------------------------------------------ | --- | --- | --- | -------- |
| §3 Terminology                             | 1   | 0   | 0   | 0        |
| §4 Protocol Overview                       | 2   | 1   | 0   | 0        |
| §5 Operations (store/recall/update/forget) | 3   | 2   | 0   | 0        |
| §6 Data Types                              | 2   | 2   | 0   | 0        |
| §7 Error Handling                          | 2   | 0   | 0   | 0        |
| §8 Versioning Protocol                     | 1   | 1   | 1   | 0        |
| §9 Capability Negotiation                  | 2   | 0   | 2   | 1        |
| §10 Security                               | 4   | 0   | 0   | 0        |
| §11 Conformance Requirements               | 0   | 3   | 0   | 0        |
| **合計**                                   | 17  | 9   | 3   | 1        |

## 要件別評価

### §3 Terminology

| 仕様要件                    | 実装状況                           | 状態 | 実装ファイル                                             | 不足点 / Action |
| --------------------------- | ---------------------------------- | ---- | -------------------------------------------------------- | --------------- |
| RFC 2119 準拠、用語定義一貫 | 仕様文書で定義、実装は用語を再利用 | ✅   | `packages/mcp-memory-protocol/src/types.ts`, `errors.ts` | —               |

### §4 Protocol Overview

#### §4.1 Memory Model (3 層: episodic / semantic / procedural)

| 仕様要件                | 実装状況                                                                        | 状態 | 実装ファイル                                      | 不足点 / Action                     |
| ----------------------- | ------------------------------------------------------------------------------- | ---- | ------------------------------------------------- | ----------------------------------- |
| 3 層 enum 定義          | `MemoryLayerSchema` Zod enum で `episodic`/`semantic`/`procedural`              | ✅   | `packages/mcp-memory-protocol/src/schema.ts`      | —                                   |
| 層別 TTL 推奨値は参考値 | knowledgine 側は `episodic→semantic: 3`, `semantic→procedural: 10` を hard-code | ✅   | `packages/core/src/memory/memory-manager.ts:8-11` | 仕様は override を要求しないため OK |

#### §4.2 Memory Lifecycle

| 仕様要件                                    | 実装状況                                                                          | 状態 | 実装ファイル                                        | 不足点 / Action                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ---- | --------------------------------------------------- | ----------------------------------------------------------------- |
| create → update → deprecate → forget の遷移 | 全遷移が実装されているが `recall(includeVersionHistory)` の deprecated 扱いにバグ | ⚠    | `packages/mcp-server/src/memory-adapter.ts:132-135` | **PR 3 で修正**: deprecated 行の recall 条件を仕様§8.1 に合わせる |
| soft forget / hard forget 両対応            | `hard: true` で物理削除、`hard: false` で `deleted=1` セット                      | ✅   | `packages/mcp-server/src/memory-adapter.ts:342-367` | —                                                                 |

#### §4.3 Versioning Model

| 仕様要件                                | 実装状況                                    | 状態 | 実装ファイル                                                  | 不足点 / Action |
| --------------------------------------- | ------------------------------------------- | ---- | ------------------------------------------------------------- | --------------- |
| version 番号 + supersedes で chain 構築 | `version` / `supersedes_memory_id` 列で実装 | ✅   | `packages/core/src/storage/migrations/010_memory_protocol.ts` | —               |

### §5 Operations

#### §5.1 store_memory

| 仕様要件                                                  | 実装状況                     | 状態 | 実装ファイル                                                                                      | 不足点 / Action          |
| --------------------------------------------------------- | ---------------------------- | ---- | ------------------------------------------------------------------------------------------------- | ------------------------ |
| content (必須) / layer / metadata / tags / ttl (optional) | 全パラメータ受理、Zod で検証 | ✅   | `packages/mcp-memory-protocol/src/schema.ts` + `packages/mcp-server/src/memory-adapter.ts:84-118` | `ttl` 実装は PR 3 で追加 |

#### §5.2 recall_memory

| 仕様要件                                              | 実装状況                                                                          | 状態 | 実装ファイル                                        | 不足点 / Action                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| query / filter / limit / asOf / includeVersionHistory | asOf 未実装（throw capabilityNotSupported）、includeVersionHistory フィルタにバグ | ⚠    | `packages/mcp-server/src/memory-adapter.ts:120-253` | **PR 3 で修正**: asOf 実装（§8.2 準拠）、includeVersionHistory のフィルタロジック修正 |
| 返却に hasMore + totalCount                           | 両方実装、ただし count クエリと select クエリで WHERE が乖離する可能性            | ⚠    | same:196-208                                        | **PR 3 で修正**: 両クエリで同一 WHERE を使用                                          |

#### §5.3 update_memory

| 仕様要件                                             | 実装状況                                                       | 状態 | 実装ファイル                                        | 不足点 / Action                            |
| ---------------------------------------------------- | -------------------------------------------------------------- | ---- | --------------------------------------------------- | ------------------------------------------ |
| createVersion (default true) — イミュータブル版      | `createVersion: true` で旧 row を deprecated 化、新 row INSERT | ✅   | `packages/mcp-server/src/memory-adapter.ts:255-340` | version chain バグは §8.1 参照             |
| createVersion: false — インプレース更新（§9.1 Must） | 実装あり                                                       | ✅   | same                                                | —                                          |
| ttl 継承/更新ルール                                  | 未定義（PR 3 で仕様化）                                        | ❌   | same                                                | **PR 3 で実装**: design.md §TTL 継承ルール |

#### §5.4 forget_memory

| 仕様要件                                            | 実装状況                       | 状態 | 実装ファイル                                        | 不足点 / Action |
| --------------------------------------------------- | ------------------------------ | ---- | --------------------------------------------------- | --------------- |
| hard (optional, default false)                      | 実装あり                       | ✅   | `packages/mcp-server/src/memory-adapter.ts:342-367` | —               |
| reason 記録                                         | `delete_reason` 列に保存       | ✅   | same                                                | —               |
| soft forget 行は `includeVersionHistory` で取得可能 | バグあり（§5.2 recall と連動） | ⚠    | `packages/mcp-server/src/memory-adapter.ts:132-135` | **PR 3 で修正** |

### §6 Data Types

#### §6.1 MemoryEntry

| 仕様要件                                                                                                                               | 実装状況                                                                                       | 状態 | 実装ファイル                                | 不足点 / Action |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---- | ------------------------------------------- | --------------- |
| id / content / layer / metadata / tags / createdAt / updatedAt / deprecated / deprecationReason / supersedes / validFrom / accessCount | `deprecated` / `deprecationReason` / `supersedes` / `validFrom` が `RecalledMemory` 型に未定義 | ⚠    | `packages/mcp-memory-protocol/src/types.ts` | **PR 2 で追加** |
| `version` / `validFrom` / `validUntil` 必須                                                                                            | schema は持つが型に反映されていない                                                            | ⚠    | same                                        | **PR 2 で反映** |

#### §6.2 MemoryMetadata

| 仕様要件                           | 実装状況             | 状態 | 実装ファイル                                 | 不足点 / Action |
| ---------------------------------- | -------------------- | ---- | -------------------------------------------- | --------------- |
| source / project / etc. (optional) | Zod passthrough 許容 | ✅   | `packages/mcp-memory-protocol/src/schema.ts` | —               |

#### §6.3 RecallFilter

| 仕様要件                             | 実装状況 | 状態 | 実装ファイル                                        | 不足点 / Action |
| ------------------------------------ | -------- | ---- | --------------------------------------------------- | --------------- |
| layer / tags / dateRange / memoryIds | 実装あり | ✅   | `packages/mcp-server/src/memory-adapter.ts:120-253` | —               |

#### §6.4 VersionInfo

| 仕様要件                                      | 実装状況                             | 状態 | 実装ファイル                                | 不足点 / Action |
| --------------------------------------------- | ------------------------------------ | ---- | ------------------------------------------- | --------------- |
| version / supersedes / validFrom / validUntil | row レベルでは持つが公開型には未露出 | ⚠    | `packages/mcp-memory-protocol/src/types.ts` | **PR 2 で追加** |

### §7 Error Handling

#### §7.1 Error Codes

| 仕様要件                                                                                                                             | 実装状況              | 状態 | 実装ファイル                                      | 不足点 / Action |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ---- | ------------------------------------------------- | --------------- |
| MEMORY_NOT_FOUND / INVALID_CONTENT / INVALID_LAYER / INVALID_PARAMETER / VERSION_CONFLICT / STORAGE_ERROR / CAPABILITY_NOT_SUPPORTED | 7 code + factory 実装 | ✅   | `packages/mcp-memory-protocol/src/errors.ts:3-55` | —               |

#### §7.2 Error Response Format

| 仕様要件                                               | 実装状況                 | 状態 | 実装ファイル                               | 不足点 / Action |
| ------------------------------------------------------ | ------------------------ | ---- | ------------------------------------------ | --------------- |
| `{ isError: true, content: [{ type: "text", text }] }` | `formatToolError` で実装 | ✅   | `packages/mcp-server/src/helpers.ts:91-98` | —               |

### §8 Versioning Protocol

#### §8.1 Version Chain

| 仕様要件                                                           | 実装状況                                                                     | 状態 | 実装ファイル                                        | 不足点 / Action |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---- | --------------------------------------------------- | --------------- |
| 旧エントリを `deprecated: true`、新エントリの `supersedes` に旧 ID | schema 実装済みだが `recall` 統合時の `includeVersionHistory` ロジックにバグ | ⚠    | `packages/mcp-server/src/memory-adapter.ts:132-135` | **PR 3 で修正** |

#### §8.2 Point-in-Time Recall (asOf)

| 仕様要件                                                                                                                                                                  | 実装状況                                    | 状態 | 実装ファイル                                          | 不足点 / Action                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. `validFrom <= asOf` 候補選択、2. deprecated 行でも deprecated 化時刻が asOf より後なら含める、3. deprecated: false は常に含める、4. 同一 chain から asOf 時点最新 1 件 | 未実装（`temporal_query` capability false） | ❌   | `packages/mcp-server/src/memory-adapter.ts:73-82,122` | **PR 3 で実装**（migration 019 追加、recall() asOf ブランチ、chain 集約アルゴリズム） |

### §9 Capability Negotiation

#### §9.1 Required Capabilities

| 仕様要件                                                                                             | 実装状況                                                     | 状態 | 実装ファイル                                | 不足点 / Action |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---- | ------------------------------------------- | --------------- |
| store_memory / recall_memory (no asOf) / update_memory (createVersion: false) / forget_memory (soft) | 全 4 操作実装済み、conformance は新 API 刷新後に PR 3 で緑化 | ⚠    | `packages/mcp-server/src/memory-adapter.ts` | **PR 3 で緑化** |

#### §9.2 Optional Capabilities

| 仕様要件                | 実装状況                     | 状態     | 実装ファイル                                         | 不足点 / Action                                        |
| ----------------------- | ---------------------------- | -------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `versioning`            | true 宣言、実装あり          | ✅       | `packages/mcp-server/src/memory-adapter.ts:73-82`    | —                                                      |
| `layer_promotion`       | true 宣言、auto promote 実装 | ✅       | `packages/core/src/memory/memory-manager.ts:218-237` | —                                                      |
| `temporal_query` (asOf) | false 宣言                   | ❌       | `packages/mcp-server/src/memory-adapter.ts:73-82`    | **PR 3 で実装**（§8.2 参照）                           |
| `ttl`                   | false 宣言                   | ❌       | same                                                 | **PR 3 で実装**（lazy expire + 継承）                  |
| `semantic_search`       | false 宣言                   | Deferred | same                                                 | **KNOW-340-followup-semantic-search-memory.md で起票** |

#### §9.3 Capability Discovery

| 仕様要件                              | 実装状況 | 状態 | 実装ファイル                                      | 不足点 / Action |
| ------------------------------------- | -------- | ---- | ------------------------------------------------- | --------------- |
| `get_memory_capabilities` tool で公開 | 実装あり | ✅   | `packages/mcp-server/src/memory-tools.ts:182-197` | —               |

### §10 Security Considerations

#### §10.1 データ保護

| 仕様要件                               | 実装状況                                  | 状態 | 実装ファイル                                     | 不足点 / Action |
| -------------------------------------- | ----------------------------------------- | ---- | ------------------------------------------------ | --------------- |
| プリペアドステートメントで SQLi を防止 | better-sqlite3 の `prepare` + bind を使用 | ✅   | `packages/mcp-server/src/memory-adapter.ts` 全体 | —               |

#### §10.2 アクセス制御

| 仕様要件                   | 実装状況                           | 状態 | 実装ファイル                             | 不足点 / Action |
| -------------------------- | ---------------------------------- | ---- | ---------------------------------------- | --------------- |
| MCP server 層で認証（MAY） | REST は Bearer、stdio は接続者信頼 | ✅   | `packages/mcp-server/src/rest-server.ts` | —               |

#### §10.3 Hard Forget

| 仕様要件                        | 実装状況                          | 状態 | 実装ファイル                                        | 不足点 / Action |
| ------------------------------- | --------------------------------- | ---- | --------------------------------------------------- | --------------- |
| hard forget は DELETE、復元不可 | `memoryManager.remove()` 呼び出し | ✅   | `packages/mcp-server/src/memory-adapter.ts:342-367` | —               |

#### §10.4 自動削除

| 仕様要件                                                       | 実装状況                                                                       | 状態 | 実装ファイル | 不足点 / Action         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---- | ------------ | ----------------------- |
| TTL / 層降格などの自動削除は明示的 policy が必要（実装者判断） | PR 3 で lazy expire 実装後、TTL 超過行は recall から除外される（削除はしない） | ✅   | —            | PR 3 実装後に ✅ に遷移 |

### §11 Conformance Requirements

#### §11.1 MUSTレベル（必須要件）

| 仕様要件                       | 実装状況                                    | 状態 | 実装ファイル                                    | 不足点 / Action |
| ------------------------------ | ------------------------------------------- | ---- | ----------------------------------------------- | --------------- |
| 4 操作が conformance test 全緑 | PR 2 で conformance API 刷新、PR 3 で全緑化 | ⚠    | `packages/mcp-memory-protocol/src/conformance/` | **PR 2 + PR 3** |

#### §11.2 SHOULDレベル（推奨要件）

| 仕様要件                   | 実装状況                                   | 状態 | 実装ファイル | 不足点 / Action |
| -------------------------- | ------------------------------------------ | ---- | ------------ | --------------- |
| Error Response Format 遵守 | 実装あり、conformance 刷新後テストで再確認 | ⚠    | —            | **PR 2 + PR 3** |
| Capability Discovery tool  | 実装済み、新 conformance でテスト          | ⚠    | —            | **PR 2 + PR 3** |

#### §11.3 MAYレベル（任意要件）

| 仕様要件                                                               | 実装状況                                                      | 状態     | 実装ファイル | 不足点 / Action |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- | -------- | ------------ | --------------- |
| Optional capability（temporal_query / ttl / semantic_search / …） 実装 | temporal_query / ttl を PR 3 で実装、semantic_search は defer | Deferred | —            | —               |

## Deferred 項目（Fast-follow 起票）

| 項目                                      | 理由                                 | 起票先ファイル                                                                                   |
| ----------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| semantic_search (memory 層への embedding) | core 侵襲大、独立機能                | `~/workspaces/dev-butler/projects/knowledgine/tasks/KNOW-340-followup-semantic-search-memory.md` |
| v1.0.0 GA + npm publish                   | 品質 soak 期間必要                   | `~/workspaces/dev-butler/projects/knowledgine/tasks/KNOW-340-followup-v1-release.md`             |
| cursor ベース pagination                  | 現仕様の hasMore + totalCount で十分 | （必要になれば別チケット）                                                                       |
| MCP 仕様リポ SEP PR 提出                  | 事業系キャンセル済                   | （再検討時に起票）                                                                               |
| Mem0 / Zep 互換性デモ                     | 外部依存大                           | （該当実装が安定化してから）                                                                     |

## 結論

- **Must クリア可能性**: 高い。PR 2 (conformance API 刷新 + types 拡張) と PR 3 (memory-adapter バグ修正 + asOf + ttl 実装) を完遂すれば §3-§11 の全 MUST / SHOULD 要件が ✅ になる
- **Critical Path**:
  1. PR 2 で types.ts 拡張 + conformance API 刷新 → consumer 型解決が通るようにする
  2. PR 3 で memory-adapter の recall バグ修正 + asOf（§8.2 準拠）+ ttl（継承ルール含む）
  3. PR 4 で公開メタデータ整備 + LICENSE + CHANGELOG + MIGRATION
  4. PR 5 で examples
- **Blocker なし** — Migration 019/020 番号衝突は確認済み（現行 max=18、019/020 は未使用）

## Revision History

- 2026-04-24: 初版作成（KNOW-340 Phase 1）
