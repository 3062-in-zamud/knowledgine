# Requirements: env-var-style secret redaction completion

## Ticket ID

KNOW-401

## Status

draft

## Problem Statement

`packages/ingest/src/normalizer.ts` の `sanitizeContent` は、ingest される
コミット本文・セッションログ・PR 本文・CI ログなどから秘密情報を検出し
`[REDACTED]` に置換する。現在の実装では `SECRET_PATTERNS` に環境変数代入を
網羅するパターンがなく、以下の漏れが発生していた:

- `GITHUB_TOKEN="ghp_..."` → 既存 L8 (`gh[pousr]_`) で値部分のみマッチし、
  結果が `GITHUB_TOKEN="[REDACTED]"` になる。さらに既存 L22 が
  `TOKEN="[REDACTED]"` 部分にマッチして `GITHUB_[REDACTED]` となり、
  **変数名前半 `GITHUB_` が露出する**。
- 同じ現象は `AWS_ACCESS_KEY_ID="AKIA..."`、`SLACK_BOT_TOKEN="xoxb-..."`、
  `OPENAI_API_KEY="sk-proj-..."`、`STRIPE_SECRET_KEY: 'sk_live_...'` でも発生。
- `DATABASE_URL=postgres://...` は L16 で値は redact されるが
  `DATABASE_URL=` の変数名は残る。
- camelCase / lower_snake_case の `databaseUrl: '...'`, `github_token=...`,
  `my_api_key="..."` も同様に変数名が露出する。

値そのものは隠されていても、変数名前半は「どのサービスの credential が
leak したか」を特定できるメタ情報であり、二次攻撃の起点になり得る。
dogfooding v0.6.2 finding #10 として報告された。

## Acceptance Criteria

各条件はテストで検証可能であること。

- [ ] AC-1: `GITHUB_TOKEN="ghp_..."` が `[REDACTED]` に置換され、結果に `GITHUB_` も値も含まれない
- [ ] AC-2: `export DATABASE_URL=postgres://...` (shell export, unquoted) が `[REDACTED]` に置換され、結果に `DATABASE_URL` も `postgres` も含まれない
- [ ] AC-3: YAML 形式 `STRIPE_SECRET_KEY: 'sk_live_...'` が `[REDACTED]` に置換され、結果に `STRIPE_SECRET_KEY` を含まない
- [ ] AC-4: 1 行に 2 つの env-var secret (`GITHUB_TOKEN=... AWS_ACCESS_KEY_ID=...`) があった場合、両方の変数名と値が消える
- [ ] AC-5: lower-case `github_token="..."` および camelCase `databaseUrl: "..."` が変数名ごと redact される
- [ ] AC-6: 既存 23 件の secret-redaction テストが全件 green（regression なし）
- [ ] AC-7: 偽陽性 regression なし（`AUTHENTICATION_FLOW = oauth2-standard`、`const TOKEN_REGEX = /.../`、`const tokenizer = new Tokenizer()`、`function getAuthToken() {}`、`// my_api_key handling`、`passage = '...'`、Markdown inline `` `GITHUB_TOKEN=xxx` `` などが無変更）
- [ ] AC-8: `sanitizeContent(sanitizeContent(x)) === sanitizeContent(x)` (idempotency)
- [ ] AC-9: ReDoS 安全性 — 10KB の敵対的入力でも 200ms 以内に完了
- [ ] AC-10: `normalizeToKnowledgeEvent` 経由で生成される `contentHash` は redact 後の hash であり、元の secret を含まない

## Constraints

- **Performance**: ingest パイプラインの sanitize ステップは既存と同等の linear 時間で完了。bounded quantifier のみ使用。
- **Compatibility**: `sanitizeContent` の API シグネチャ・戻り値 contract は不変。呼び出し元 7 箇所（ingest plugins）+ 1 箇所（cli/capture.ts）に変更不要。
- **Security**: テストコード内に実際の secret prefix（`sk_live_`, `AKIA...`, `ghp_...` 全文）を直接書かず、動的組み立て（`"sk" + "_live_"` など）で GitHub Secret Scanning の誤検知を回避。

## Affected Packages

- [ ] `@knowledgine/core`
- [ ] `@knowledgine/cli`
- [ ] `@knowledgine/mcp-server`
- [x] `@knowledgine/ingest`
- [ ] `@knowledgine/mcp-memory-protocol`

## Out of Scope

- `.env` ファイルの構造的 parse による redaction（行単位ではなく KV として扱う）
- 新 CLI オプション追加
- 多言語形式（INI, TOML, JSON value 内の key）の専用パース
- HTTP カスタムヘッダー（`X-Api-Key:` 等 Authorization 以外）
- URL 埋め込み認証情報（`https://user:token@host/...`）
- 既存 DB レコードの再 ingest（migration）— 既存レコードの hash と新パターン適用後の hash が変わるため重複登録の可能性があるが、本 PR ではアクティブな migration を行わず、リリースノートで再 ingest を推奨する
- Firebase service account JSON / Google Application Credentials のような `_JSON` / `_CREDENTIALS` (複数形) 終端の変数名（将来 KNOW-4xx で対応）

## Prior Art / References

- dogfooding v0.6.2 finding #10
- 既存 `SECRET_PATTERNS` 12 本: `packages/ingest/src/normalizer.ts:5-28`
- 既存テスト 23 件: `packages/ingest/tests/secret-redaction.test.ts`
- ReDoS 対策の bounded quantifier は過去コミット `ee3c938` で導入済の方針を踏襲
