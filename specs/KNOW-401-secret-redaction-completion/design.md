# Design: env-var-style secret redaction completion

## Ticket ID

KNOW-401

## Architecture Overview

`packages/ingest/src/normalizer.ts` の `SECRET_PATTERNS` 配列に env-var
代入形式を変数名ごと redact する 2 本の正規表現を **配列の先頭** に追加する。

```
[Existing flow]                       [New flow]
content                               content
  │                                     │
  └─ for each SECRET_PATTERNS[i]        └─ for each SECRET_PATTERNS[i]
       replace match → "[REDACTED]"           replace match → "[REDACTED]"
                                                │
                                                ├─ [0] KNOW-401 Pattern A (UPPER_SNAKE)  ← new
                                                ├─ [1] KNOW-401 Pattern B (lower/camelCase) ← new
                                                ├─ [2] generic api_key/token/...
                                                ├─ [3] sk-/pk-/...
                                                ├─ [4] gh[pousr]_...
                                                └─ ... (既存パターン)
```

`sanitizeContent` 関数自体は無変更。配列に 2 行追加（コメント込み 16 行）のみ。

## Interface Definitions

API シグネチャ変更なし。

```typescript
// packages/ingest/src/normalizer.ts (unchanged)
export function sanitizeContent(content: string): string;
export function computeContentHash(content: string): string;
export function normalizeToKnowledgeData(event: NormalizedEvent): KnowledgeData;
export function normalizeToKnowledgeEvent(event: NormalizedEvent): KnowledgeEvent;
```

## Data Flow

1. `NormalizedEvent.content` を受け取る（plugin で生成済み）
2. `sanitizeContent` 呼び出し
3. `SECRET_PATTERNS[0]` (Pattern A) が UPPER_SNAKE env-var 代入を全体 redact
4. `SECRET_PATTERNS[1]` (Pattern B) が lower/camelCase env-var 代入を全体 redact
5. 後続の既存パターン（generic, sk-, ghp\_, xoxb-, AKIA, JWT, scheme://, PEM, L22, xox\*, Authorization）が、redact 漏れの単独 secret 値を補完的に redact
6. `computeContentHash(sanitized)` で hash を計算（contentHash として使用）
7. `KnowledgeData` / `KnowledgeEvent` を返却

## Key Design Decisions

### Decision 1: 既存 L22 を拡張せず新 pattern を 2 本追加

- **Chosen**: `SECRET_PATTERNS` 配列の先頭に 2 本（A: UPPER_SNAKE / B: lower/camelCase）追加。既存 12 パターンは温存。
- **Alternatives considered**:
  - (i) 既存 L22 `(?:SECRET|TOKEN|...)[\w]{0,30}...` を拡張して変数名前半を含むよう改修
  - (ii) 単一 regex で UPPER/lower 両対応
- **Rationale**:
  - 既存 18 件 positive / 5 件 negative のテストへの regression リスクを最小化
  - 差分が局所化され、rollback が行削除のみで済む
  - 冪等性（同じ位置で複数 pattern が match しても結果は `[REDACTED]`）により重複適用は無害
  - 単一 regex 案は false positive 境界の調整が困難（`/i` を付けると `const TOKEN_REGEX` が引っかかる）

### Decision 2: 配列の先頭に挿入（既存パターンより前）

- **Chosen**: `SECRET_PATTERNS[0]`, `[1]` として挿入し、最初に env-var 形式全体を redact する。
- **Alternatives considered**: 配列末尾に追加し、既存パターンが先に値を redact した後で残った変数名を消す方針。
- **Rationale**:
  - 末尾配置だと「既存 L8 (`gh[pousr]_`) が `ghp_...` を redact → 結果 `GITHUB_TOKEN="[REDACTED]"`」が先に発生し、後段の Pattern A が `[REDACTED]` 部分を再度マッチして `[REDACTED]` で置換する形になる（結果は同じ `[REDACTED]` だが冪等性に依存した順序設計になる）。
  - 先頭配置は「最も具体的な env-var 代入全体を 1 ステップで redact」という意図が明確で、順序依存を排除できる。

### Decision 3: UPPER と lower/camelCase で 2 本に分ける（`/i` フラグなし）

- **Chosen**: Pattern A は `[A-Z]` 強制、Pattern B は `[a-z]` 始まり + キーワード 1 文字目の大小許容 `[Tt]oken` 形式。
- **Alternatives considered**: `/i` フラグ 1 本で両対応。
- **Rationale**:
  - `/i` フラグ案は `const TOKEN_REGEX = /.../` の `const ` が小文字始まりの位置で UPPER pattern にマッチしてしまう（`const ` も `[a-zA-Z]+` でマッチ）。
  - case-strict 境界を入れることで偽陽性を確実に排除。Pattern B の keyword 1 文字目だけ大小許容するのは camelCase（`databaseUrl`）対応のため最小限の譲歩。

### Decision 4: bounded quantifier 厳守

- **Chosen**: 全 quantifier を `{0,8}`, `{0,32}`, `{0,63}`, `{1,256}`, `{4,256}` のように上限付きに。
- **Rationale**: ReDoS 対策。レビューで Pattern B の `[a-z][a-zA-Z0-9]*` が unbounded だった案を `{0,63}` に制限した（変数名最大長 64 文字を仮定）。10KB 敵対的入力でも 200ms 内で完了するテストを追加。

## Migration Strategy

N/A（純粋な redaction 強化、入出力契約不変）。

ただし運用上の注意:

- 新パターン追加後は redact 結果が変わる（`GITHUB_[REDACTED]` → `[REDACTED]`）。
- `computeContentHash(sanitized)` が hash 一意性キーなので、既存 DB レコードと
  新パターン適用後のレコードで hash が異なり、重複登録される可能性。
- 本 PR では migration スクリプトは提供しない。リリースノートで「既存レコードの
  再 ingest を推奨」と案内（KNOW-401 完了時の v0.7.0 release note）。

## Security Considerations

- パターンは静的リテラル。外部入力から regex を生成しないので injection なし。
- bounded quantifier のみで ReDoS-safe。`[^"\n]{1,256}` 等の negative char class
  で linear-time マッチング。
- テストコードでは GitHub Secret Scanning 誤検知回避のため secret prefix を
  動的組み立て（`"sk" + "_live_"`, `"ghs" + "_" + "A".repeat(36)` 等）。

## Testing Strategy

- **Unit tests** (secret-redaction.test.ts):
  - positive 12 件追加: AC-1〜AC-9 をカバー（KNOW-401 A: 7 件、KNOW-401 B: 2 件、idempotency / ReDoS / backtick: 3 件）
  - negative 9 件追加: 偽陽性 regression 防止
  - 既存 8 件の assertion 強化: `not.toContain("GITHUB_")`, `not.toContain("DATABASE_URL")` 等で変数名前半の非含有を検証
- **Integration test** (normalizer.test.ts):
  - `normalizeToKnowledgeEvent` 経由で `contentHash === sha256("[REDACTED]")` を検証（AC-10）
- **Plugin regression**:
  - ingest 581 件の既存テストが全件 green
  - cli の non-e2e テスト（392 件）が green
- **CI matrix**: Node 20 / 22 で `pnpm verify`（build + typecheck + lint + format:check + test:run）が緑

## Dependencies

- New dependencies: なし
- Modified packages: `@knowledgine/ingest` のみ
