# Design: KNOW-340 MCP Memory Protocol 参照実装

## Ticket ID

KNOW-340

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ Public surface (@knowledgine/mcp-memory-protocol v0.3.1)             │
│                                                                       │
│  ."  → types.ts, provider.ts, schema.ts, errors.ts                    │
│       ├─ MemoryProvider interface                                     │
│       ├─ MemoryStoreRequest/Response, RecalledMemory, VersionInfo …   │
│       ├─ MemoryProtocolError + factories                              │
│       └─ Zod schemas                                                  │
│                                                                       │
│  "./conformance" → conformance/index.ts                               │
│       └─ runConformanceSuite({ createProvider, teardown?, skip? })    │
└─────────────────────────────────────────────────────────────────────┘
               ▲                                        ▲
               │ implements                             │ imports
               │                                        │
   ┌───────────┴──────────┐              ┌──────────────┴────────────┐
   │ Reference impl        │              │ External impl (future)    │
   │ KnowledgineMemory      │              │  e.g. Mem0Provider        │
   │ Provider               │              │       ZepProvider         │
   │ (mcp-server)           │              │                           │
   └───────────┬──────────┘              └────────────┬──────────────┘
               │ uses                                 │ drops in
               ▼                                      ▼
   ┌──────────────────────┐              ┌──────────────────────────┐
   │ @knowledgine/core     │              │ External backend          │
   │  - MemoryManager      │              │  (remote service / DB)    │
   │  - migrations 019/020 │              │                           │
   │  - memory_entries table               └──────────────────────────┘
   │    (+ valid_until, expires_at)
   └──────────────────────┘

  examples/                                    tests/
    minimal-provider/     (50-line Map-based, workspace:*, npm 公開対象外)
    knowledgine-provider/ (薄いアダプタ例、workspace:*)

  tests/
    fake-provider.ts       (PR 2 smoke、capabilities: versioning+ttl true)
    conformance-fake.test.ts       (PR 2 で非 skip)
    conformance-knowledgine.test.ts (PR 2 skip → PR 3 unskip)
```

責務分離表:

| 成果物                                      | 目的                                            | 対象読者                         |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| `mcp-memory-protocol-spec.md`               | プロトコル仕様                                  | 実装者全員（knowledgine / 外部） |
| `proposal/implementation-guide.md`          | 他実装向け「自プロバイダーを作るには？」        | 外部実装者                       |
| `proposal/gap-analysis.md`                  | knowledgine の仕様準拠状況                      | 開発者、レビュアー               |
| `packages/mcp-memory-protocol/README`       | npm consumer 向け「インストール〜 Quick start」 | npm パッケージを使う開発者       |
| `packages/mcp-memory-protocol/MIGRATION.md` | 破壊的変更のマイグレーションガイド              | v0.3.x → v0.4.x 移行者           |
| `examples/minimal-provider/README`          | 最小動作例                                      | 「まず動かしたい」外部実装者     |

## Interface Definitions

### RunConformanceOptions（新 conformance API、PR 2 で導入）

```typescript
// packages/mcp-memory-protocol/src/conformance/index.ts

import type { MemoryProvider, MemoryProviderCapabilities } from "../provider.js";

export interface RunConformanceOptions {
  /** プロバイダーのインスタンスを返す factory。各テストケースごとに呼ばれる（per-test isolation）。 */
  createProvider: () => Promise<MemoryProvider> | MemoryProvider;

  /** テスト後にプロバイダーのクリーンアップを行う（DB close 等）。 */
  teardown?: (provider: MemoryProvider) => Promise<void> | void;

  /** 明示的にスキップする capability の test-suite。capabilities のキー（camelCase）と一致。 */
  skip?: Array<
    keyof Pick<
      MemoryProviderCapabilities,
      "versioning" | "temporalQuery" | "ttl" | "semanticSearch" | "layerPromotion"
    >
  >;
}

/**
 * 仕様準拠テストを走らせる。vitest の describe/it ブロックを内部で発行し、
 * createProvider は各テストの beforeEach で呼ばれる。
 *
 * capabilities の自動判定:
 *   provider.capabilities() の返り値に基づき、該当 capability が true の
 *   test-suite のみ実行する。skip オプションで明示的に除外も可能。
 */
export function runConformanceSuite(options: RunConformanceOptions): void;
```

**設計上の制約**:

- `capabilities` オーバーライドフィールドは **削除**（provider.capabilities() で十分、モックは createProvider 側で細工）
- `skip` のキー名は `MemoryProviderCapabilities` のキー（camelCase: `temporalQuery`, `semanticSearch`）と完全一致
- 各 test-suite は `describe()` を発行、`beforeEach` で `createProvider()` を per-test 呼び出し（状態汚染防止）

### `RecalledMemory` 型拡張（PR 2）

```typescript
// packages/mcp-memory-protocol/src/types.ts

export interface RecalledMemory {
  id: string;
  content: string;
  layer: MemoryLayer;
  metadata?: MemoryMetadata;
  tags?: string[];
  createdAt: string;
  updatedAt: string;

  // 以下を PR 2 で追加（仕様 §6.1 準拠）
  /** 論理削除フラグ（soft forget 済み） */
  deprecated: boolean;
  /** deprecation 時の理由 */
  deprecationReason?: string;
  /** versioning capability 有効時に前バージョンの id を指す */
  supersedes?: string;
  /** このバージョンが有効になった時刻 */
  validFrom: string;
  /** 任意: relevance score (semantic_search capability 有効時) */
  relevanceScore?: number;
}
```

### Migration 019 / 020（PR 3）

```typescript
// packages/core/src/storage/migrations/019_memory_valid_until.ts
export const migration019: Migration = {
  version: 19,
  name: "019_memory_valid_until",
  up(db) {
    db.exec(`ALTER TABLE memory_entries ADD COLUMN valid_until TEXT DEFAULT NULL;`);
  },
  down(_db) {
    // SQLite DROP COLUMN 制約のため no-op
  },
};

// packages/core/src/storage/migrations/020_memory_expires_at.ts
export const migration020: Migration = {
  version: 20,
  name: "020_memory_expires_at",
  up(db) {
    db.exec(`ALTER TABLE memory_entries ADD COLUMN expires_at TEXT DEFAULT NULL;`);
  },
  down(_db) {
    // 同上
  },
};
```

## Data Flow

### Store → Versioned Update → Point-in-Time Recall

```
t0: store(content="A", ttl=3600)
    → INSERT row(id=1, content="A", created_at=t0, expires_at=t0+3600s,
                 version=1, supersedes_memory_id=NULL, deleted=0)

t1: update(id=1, content="B", createVersion=true)
    → UPDATE row(1) SET valid_until=t1
    → INSERT row(id=2, content="B", created_at=t1, expires_at=t0+3600s (継承),
                 version=2, supersedes_memory_id=1, deleted=0)

t2: forget(id=2, hard=false)
    → UPDATE row(2) SET deleted=1, deleted_at=t2, delete_reason="…"

t3 (> t0+3600): 全行が expired

recall(asOf=t0.5):
    候補: created_at <= t0.5 → row(1) のみ
          deleted=0 OR deleted_at > t0.5 → row(1) deleted=0 OK
          valid_until IS NULL OR valid_until > t0.5 → row(1) valid_until=t1>t0.5 OK
          expires_at IS NULL OR expires_at > t0.5 → row(1) expires_at=t0+3600s>t0.5 OK
    chain: { 1: row(1) }
    return: [row(1)]

recall(asOf=t1.5):
    候補: row(1), row(2)
          row(1): deleted=0 ✓, valid_until=t1 <= t1.5 ✗ → 除外
          row(2): deleted=1, deleted_at=t2>t1.5 ✓, valid_until IS NULL ✓, expires_at>t1.5 ✓ → 採用
    chain: { root(1): row(2) version=2 最新 }
    return: [row(2)]

recall(asOf=t2.5):
    候補: row(1), row(2)
          row(1): valid_until=t1 <= t2.5 ✗ → 除外
          row(2): deleted=1, deleted_at=t2 <= t2.5 ✗ → 除外
    return: [] (空)

recall(asOf=t3 と +1h):
    候補なし（全行 expires_at 超過）
    return: []
```

### TTL 継承ルール

| 操作                                  | 新 row の expires_at             |
| ------------------------------------- | -------------------------------- |
| store(ttl=T)                          | now + T\*1000                    |
| update(createVersion=false, ttl 省略) | 既存 expires_at 維持（変更なし） |
| update(createVersion=false, ttl=T)    | now + T\*1000 で上書き           |
| update(createVersion=true, ttl 省略)  | 旧 row の expires_at をコピー    |
| update(createVersion=true, ttl=T)     | now + T\*1000 (新 row のみ)      |
| expired 行への update / forget        | `MEMORY_NOT_FOUND` を throw      |

## Key Design Decisions

### Decision 1: Conformance API は Provider 直差し込み（MCP Client 方式から刷新）

- **Chosen**: `runConformanceSuite({ createProvider })` で `MemoryProvider` インスタンスを直接差し込む
- **Alternatives considered**:
  - (A) 現状維持（MCP Client 経由）— 他実装が MCP サーバー立ち上げ必須で参入障壁高い
  - (B) 両方サポート（Provider + MCP Client）— メンテコスト 2 倍、API 面複雑化
- **Rationale**: 参照実装の目的は「他実装が簡単に conformance を走らせる」こと。Provider 直差しは vitest/jest どちらでも使いやすく、CI もシンプル

### Decision 2: 旧 API は clean break（deprecated 再 export しない）

- **Chosen**: 旧 `ConformanceTestContext` ベース API を削除。MIGRATION.md で diff 例を提供
- **Alternatives considered**:
  - (A) deprecated 再 export で 1 minor 猶予 — コードベース肥大化、利用者未確認のため価値低
- **Rationale**: v0.3.x の外部利用が未確認（npm download 統計なし）。現時点の clean break が最低コスト

### Decision 3: TTL は lazy expire（cron なし）

- **Chosen**: recall/update/forget のクエリで `expires_at > :now` をフィルタ
- **Alternatives considered**:
  - (A) cron cleanup — インフラ変更大、本チケット Must 範囲外
- **Rationale**: 仕様は TTL capability のみ求める。期限切れ行が DB に残ることは検索パスから見えなければ許容

### Decision 4: asOf + soft-delete は仕様§8.2 に忠実（deprecated_at > asOf を含める）

- **Chosen**: SQL で `(deleted = 0 OR deleted_at > :asOf)` を使用、asOf 時点でまだ有効だった deprecated 行も候補に入れる
- **Alternatives considered**:
  - (A) `AND deleted = 0` で一律除外 — **仕様違反**。point-in-time の意味を破壊
- **Rationale**: 仕様§8.2 step 2 に「deprecated: true かつ deprecated になった時刻が asOf より後のものを含める」と明記

### Decision 5: TTL 継承は「旧 row の expires_at を新 row にコピー、明示指定で上書き」

- **Chosen**: versioned update で ttl 省略 → 継承、ttl 明示 → 上書き
- **Alternatives considered**:
  - (A) 常にリセット（継承しない）— update で TTL が意図せず消える
  - (B) 常に継承（上書き不可）— TTL 延長/短縮ができない
- **Rationale**: 「データの同一性は維持したい、ただし必要なら調整できる」という一般的期待

### Decision 6: 同一 chain から asOf 時点最新 1 件を返すアルゴリズム

- **Chosen**: (1) SQL で候補集合を WHERE で絞る、(2) アプリ側で `supersedes_memory_id` を辿り chain root ID を算出、(3) 同 root ごとに `version` 降順で先頭 1 件を採用
- **Alternatives considered**:
  - (A) 再帰 CTE ですべて SQL で完結 — SQLite の再帰 CTE は遅く、ロジックが複雑化
  - (B) SQL で root_id を事前計算せず、返り行全てを列挙 — 仕様§8.2 step 4「1 件のみ」違反
- **Rationale**: better-sqlite3 は同期で速く、JS 側の Map 集約が最もシンプル。擬似コード:

  ```typescript
  function collapseChainsToLatestAtAsOf(candidates: Row[]): Row[] {
    const byId = new Map(candidates.map((r) => [r.id, r]));
    function rootOf(r: Row): number {
      let cur = r;
      while (cur.supersedes_memory_id != null) {
        const next = byId.get(cur.supersedes_memory_id);
        if (!next) break;
        cur = next;
      }
      return cur.id;
    }
    const groups = new Map<number, Row>();
    for (const r of candidates) {
      const root = rootOf(r);
      const existing = groups.get(root);
      if (!existing || r.version > existing.version) groups.set(root, r);
    }
    return Array.from(groups.values());
  }
  ```

### Decision 7: v1.0.0 bump は本チケット外（version フィールド不変）

- **Chosen**: package.json version は 0.3.1 のまま維持。「公開できる状態」までに留める
- **Alternatives considered**:
  - (A) 本チケットで v0.4.0 bump（breaking change 反映） — release.yml が main push で auto publish、意図せず publish されるリスク
  - (B) 本チケットで v1.0.0 GA — 品質 soak 期間なし、外部検証なしで v1 は時期尚早
- **Rationale**: version bump は別 release PR で実施。本チケットは「公開準備完了」までが責務

### Decision 8: examples は monorepo workspace member、ただし npm tarball からは除外

- **Chosen**: `pnpm-workspace.yaml` に `packages/mcp-memory-protocol/examples/*` を追加、`workspace:*` 依存で CI 検証。`package.json` の `files` から `examples` を **除外**、README で GitHub リンクによる参照を案内
- **Alternatives considered**:
  - (A) files に examples 同梱 + workspace:\* のまま — 公開後、monorepo 外でインストール不可（broken）
  - (B) files に examples 同梱 + semver 固定依存 — workspace リンクが効かず CI で実装変更追従不可
  - (C) examples をパッケージ化しない（README snippet のみ）— conformance 実行による動作証明ができない
- **Rationale**: workspace 運用で CI 検証できる利点と、公開 tarball の broken リスクを両立する

## Migration Strategy

### 019 (valid_until) と 020 (expires_at) の適用

- 既存 DB が migration 13-18 適用済みの状態を前提
- 新規カラムは `DEFAULT NULL` で追加。既存行は全て NULL になる → 後方互換
- `ALL_MIGRATIONS` 配列（`packages/core/src/index.ts`）に 019/020 を version 順に追加
- SQLite は DDL を transaction 内で実行可能（migrator.ts の `db.transaction` で担保済み）
- rollback: SQLite の `DROP COLUMN` は 3.35+ で可能だが互換性のため `down()` は no-op（既存 migration と同じ）

### 適用失敗時

- migrator.ts:48 の transaction 内で失敗すれば自動 rollback（既存実装）
- 本番 DB 適用前に `~/.knowledgine/*.db` のコピーでリハーサルを PR 3 DoD に含める

### 他下流パッケージへの影響

- `mcp-memory-protocol` の `RecalledMemory` 型拡張は後方互換（フィールド追加）
- `mcp-server` の response shaping が旧フィールドしか返していないと新 conformance で落ちる → PR 3 で同時修正
- `cli` / `ingest` は memory 層を直接触らないため影響なし（ビルド通ればOK）

## Security Considerations

- `store_memory` / `update_memory` のコンテンツは better-sqlite3 のプリペアドステートメントで扱われる（SQLi なし）
- 認証は MCP サーバー層に委譲（stdio transport は接続者を信頼する前提、REST transport は既存 Bearer）
- `examples/minimal-provider` / `knowledgine-provider` の README に **「本番データを格納しないこと」** を必須注記
- `MIGRATION.md` / 公開 README に内部チケット番号（KNOW-xxx）を含めない（memory rule: feedback_no_internal_ticket_ids）

## Testing Strategy

- **Unit tests**:
  - PR 2: `types.ts` スキーマ拡張の Zod バリデーション
  - PR 3: `memory-adapter.ts` の asOf / TTL 継承ロジック
- **Integration tests (conformance)**:
  - PR 2: `tests/conformance-fake.test.ts` が新 API で非 skip 全緑
  - PR 3: `tests/conformance-knowledgine.test.ts` が全緑（unskip）
  - PR 5: `examples/minimal-provider/test.ts` が全緑
- **Edge cases** (PR 3 で明示的テスト):
  - 同一 chain v1→v2→v3 で asOf=v2.created_at → v2 のみ返る（v1 除外、v3 未存在）
  - soft-delete + asOf=（delete の 1ms 前）→ 対象行返る
  - `deleted=1 AND deleted_at IS NULL` の不整合データが発生しないことを forget 実装で保証
  - store(ttl=3600) → versioned update (ttl 省略) → 新 row.expires_at = 旧 row.expires_at
  - expires_at 経過後の update → MEMORY_NOT_FOUND
- **Consumer-side verification** (PR 2 / PR 4):
  - monorepo 外で `file:` インストール or tarball インストール → `tsc --noEmit` + `node` 実行
- **Coverage**: 80% 以上を維持（AGENTS.md 基準）。conformance 刷新で既存テスト削除がある場合は unit test で補完

## Dependencies

- New dependencies: なし（既存の vitest / @modelcontextprotocol/sdk / zod で完結）
- Modified packages:
  - `@knowledgine/mcp-memory-protocol` (types / conformance API / package.json メタ / files 整備)
  - `@knowledgine/mcp-server` (memory-adapter バグ修正 + asOf/ttl 実装)
  - `@knowledgine/core` (migration 019/020 追加、ALL_MIGRATIONS 登録)
