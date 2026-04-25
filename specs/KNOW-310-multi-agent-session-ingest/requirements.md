# Requirements: cline-sessions ingest plugin (multi-agent session ingest)

## Ticket ID

KNOW-310

## Status

draft

## Problem Statement

knowledgine は現在 Claude Code (`claude-sessions`) と Cursor IDE (`cursor-sessions`) のセッション履歴を ingest できるが、Cline (`saoudrizwan.claude-dev` VS Code 拡張) のセッション内容を取り込めない。Cline は Claude Code に次ぐ第3のメジャーな AI コーディングエージェントであり、ユーザーが Cline で実施した問題解決・設計判断は knowledgine の検索/グラフから欠落している。

push 型 (`POST /capture`、v0.6.0 で実装済) では curl を毎回手動実行する必要があり、セッション履歴の遡及取り込みもできない。一方、過去の `docs/push-based-capture.md` L181-189 では「Cline ストレージは非公開で不安定 → push 全振り」と判断していたが、Cline v3.81.0 (2026-04-24 リリース) のソース調査により以下が確認されたため、結論を覆して pull 型対応を実装する:

1. ストレージは純粋 JSON 形式 (SQLite/leveldb 不使用)
2. Cline 側が atomic write (temp+rename) を採用しており読み取り側の lock 衝突は無し
3. `api_conversation_history.json` は Anthropic SDK 標準の `MessageParam[]` 形式
4. fixtures に Cline tag (`v3.81.0`) を pin することで CI が drift を早期検知できる

詳細根拠は `docs/research/cline-session-storage.md` 参照。

## Acceptance Criteria

すべて fixtures または合成データで検証可能。本番 Cline インスタンスでの検証は推奨だが必須ではない (Known Limitations に明記)。

- [ ] **AC-1**: `ClineSessionsPlugin` が `packages/ingest/src/index.ts` から export され、`packages/cli/src/lib/plugin-loader.ts` の registry に登録されている
- [ ] **AC-2**: `initialize()` は **常に** `{ ok: true }` を返す。ただし `CLINE_STORAGE_PATH` が指定されていてそのパスが存在しない場合は `process.stderr.write` で warning を出す (`PluginInitResult` 型に warning フィールドはないため戻り値ではなく副作用で対応)
- [ ] **AC-3**: storage ディレクトリが存在しない場合、`ingestAll()` は 0 イベントを yield して exit 0。エラーは throw しない
- [ ] **AC-4**: fixture の `tasks/<id>/` に対し 1 タスク = 1 `NormalizedEvent`。
  - `sourceUri === "cline-session://<storageHash8>/<taskId>"` (storageHash8 は sha256(storageDir).hex.slice(0,8))
  - `eventType === "capture"`
  - `title === "Cline: " + (historyItem?.task?.slice(0, 60) || taskId.slice(0, 8))`
  - `content` に `### User:` と `### Assistant:` マーカーが含まれる
- [ ] **AC-5**: API キー (`sk-ant-api03-` + 40字以上)、JWT、Bearer トークンが `sanitizeContent` で `[REDACTED]` に置換される。テストで `sk-ant-api03-` という raw 文字列が出力に残らないことをアサート
- [ ] **AC-6**: `ingestIncremental(sourceUri, checkpoint)` は checkpoint 以降の **task ディレクトリ内 3 ファイル** (`api_conversation_history.json`, `ui_messages.json`, `task_metadata.json`) の **max mtime** が checkpoint 以上のタスクのみ yield する。checkpoint が無効 ISO 文字列の場合は `new Date(0)` フォールバックで全タスクを対象にする
- [ ] **AC-7**: `getCurrentCheckpoint(sourceUri)` は タスクが 0 件のとき `new Date(0).toISOString()`、それ以外は全タスクの max mtime の ISO 文字列を返す
- [ ] **AC-8**: malformed JSON / EBUSY / EPERM / ENOENT を try/catch で捕捉し、該当タスクを skip。`process.stderr.write(\`⚠ Skipped (\${basename(taskDir)}): \${reason}\\n\`)` で警告を出力。**絶対パスは含めない**
- [ ] **AC-9**: `CLINE_STORAGE_PATH` 環境変数が OS デフォルトを上書きする。指定値は **絶対パス必須** (`isAbsolute` 検証) で `realpath` で symlink 解決する
- [ ] **AC-10**: `packages/core/src/types.ts` の `SourceType` に `"cline"` が追加され、`packages/ingest/src/normalizer.ts` の `SOURCE_TYPE_MAP` に `"cline-sessions": "cline"` が明示登録される
- [ ] **AC-11**: `docs/push-based-capture.md` L181-189 の「push 全振り」結論が、`docs/research/cline-session-storage.md` を参照する内容に書き換えられている
- [ ] **AC-12**: `docs/research/cline-session-storage.md` が存在し、(a) 調査日付 `2026-04-25`、(b) Cline tag `v3.81.0` の pin、(c) ストレージレイアウト、(d) 4 ファイルそれぞれのスキーマ、(e) リスク台帳と緩和策、を含む
- [ ] **AC-13**: `pnpm --filter @knowledgine/ingest test` および `pnpm verify` がローカル (Node 20 / 22 両方) と CI で exit 0
- [ ] **AC-14**: 新規 3 テストファイル (`storage-locator.test.ts`, `session-parser.test.ts`, `cline-sessions-plugin.test.ts`) で `cline-sessions` プラグインのソース行カバレッジ >= 80%、分岐 >= 70%
- [ ] **AC-15**: `decision-detector` と `extractTextContent` が `packages/ingest/src/shared/` に移動済み。`claude-sessions` および `cline-sessions` の双方が `shared/` から import する
- [ ] **AC-16**: `ClineSessionsPlugin.triggers === [{ type: "manual" }]` (file_watcher dead code を新たに増やさない)

## Constraints

- **Performance**: 200 メッセージ以下のタスクで 1 件あたり < 50ms (fixture ベース)。500 タスクの `getCurrentCheckpoint` が < 1秒
- **Compatibility**: Node 20+ (CI matrix), TypeScript ESM, 相対 import は `.js` 拡張子
- **Security**:
  - `sanitizeContent` を必ず通す
  - stderr に絶対パスを含めない (basename のみ)
  - `CLINE_STORAGE_PATH` には `isAbsolute` + `realpath` 検証
  - fixtures に実データを含めない (合成トークンのみ)
  - 10MB 超のファイルは skip (Node ヒープ保護)

## Affected Packages

- [x] `@knowledgine/core` (`SourceType` に `"cline"` 追加、1 行)
- [x] `@knowledgine/cli` (plugin-loader 登録、ingest コマンド分岐、skill template 更新、README/CHANGELOG)
- [ ] `@knowledgine/mcp-server`
- [x] `@knowledgine/ingest` (新規プラグイン、shared/ 昇格、normalizer SOURCE_TYPE_MAP)
- [ ] `@knowledgine/mcp-memory-protocol`

## Out of Scope

- VS Code Insiders / VSCodium / Cursor / Windsurf 上にインストールされた Cline (`CLINE_STORAGE_PATH` 環境変数で部分的に回避可)
- `context_history.json` を活用した context graph 拡張
- streaming JSON parser (50MB 超対応)
- parent/child task の `note_links` 自動生成
- `.knowledginerc.json` の `ingest.cline.*` 全面対応
- Cursor `state.vscdb` (SQLite) の改修と既存 `cursor-sessions` プラグインの強化
- Windsurf / Codex CLI / Copilot Chat のストレージ調査
- `gitleaks` / `secretlint` の pre-commit 導入
- `events` テーブルの `source_uri` UNIQUE 制約追加 (再 ingest 時の重複対策、別チケット化)
- `cursor-sessions` と `claude-sessions` の Invalid Date silent fallback 修正 (横断バグ、別チケット化)

## Prior Art / References

- 既存プラグイン: `packages/ingest/src/plugins/{claude,cursor}-sessions/`
- 旧結論 (今回覆す対象): `docs/push-based-capture.md` L181-189
- push 型完了済 (v0.6.0): `packages/mcp-server/src/rest-server.ts:182`
- 調査レポート: `docs/research/cline-session-storage.md`
- Cline v3.81.0 ソース: https://github.com/cline/cline/tree/v3.81.0
- MEMORY: `feedback_no_internal_ticket_ids.md`, `feedback_main_merge_via_pr.md`, `feedback_no_tag_push.md`, `feedback_worktree_inside_project.md`
