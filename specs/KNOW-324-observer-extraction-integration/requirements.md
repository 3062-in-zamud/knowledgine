# Requirements: Observer/Reflector integration with pattern/entity extractors

## Ticket ID

KNOW-324

## Status

implemented (housekeeping only — implementation landed in KNOW-305 + KNOW-323)

## Problem Statement

歴史的経緯として:

- KNOW-305: ingest 時にパターン抽出 (PatternExtractor) とエンティティ抽出
  (EntityExtractor) を自動実行する仕組みを実装。
- KNOW-323: Observer / Reflector エージェントを `--observe` opt-in に切替。
  Observer Agent が PatternExtractor / EntityExtractor を deps として受け取り、
  observe 時に extractDailyPatterns / extractTicketPatterns / extract を呼ぶ
  形に再設計された (`packages/core/src/agents/observer-agent.ts:15-16, 119-124`)。

KNOW-324 は KNOW-305 が Observer 経由でなく単独で動いていた頃の名残として
登録されたチケットで、本質的な統合は KNOW-323 の段階で完了している。本
チケットは仕上げとして:

- 統合状態を SDD spec として明文化 (再設計の根拠を後発の開発者が辿れるように)
- user-facing な Observer 運用ドキュメント (`docs/agents/observer.md`) を追加
- 旧 KNOW-305 と本チケットの関係を tasks/ ディレクトリ側で記録

## Acceptance Criteria

すべて既存実装で満たされていることを spec / docs / tests で立証する。

- [ ] **AC-1**: `ObserverAgent` が `PatternExtractor` と `EntityExtractor` を
      必須 deps として保持する (`observer-agent.ts:15-16`)
- [ ] **AC-2**: `Observer.observeBatch(notes)` 呼び出しで pattern (daily +
      ticket) と entity が自動抽出される (`observer-agent.ts:119-124`)
- [ ] **AC-3**: CLI `knowledgine ingest --source <id> --observe --path <dir>`
      で ingest 後の post-process として Observer/Reflector が起動する
      (`packages/cli/src/commands/ingest.ts:522-568`)
- [ ] **AC-4**: `--observe` を指定しない既存フローでは Observer は起動せず、
      ingest engine が events / notes を書き込むだけの従来挙動が維持される
- [ ] **AC-5**: `packages/cli/tests/commands/ingest-observe.test.ts` が
      Observer 経由統合の主要パスをカバー (Observer 起動・上限・スキップ)
- [ ] **AC-6**: `docs/agents/observer.md` で Observer 経由の自動抽出フロー
      (PatternExtractor / EntityExtractor の役割、`--observe` の意味、
      rule-based / LLM の差) が user-facing に説明されている
- [ ] **AC-7**: README に `--observe` の使用例が 1 行以上記載されている
- [ ] **AC-8**: dev-butler 側の旧 `KNOW-305` (ingest時パターン抽出と…) タスク
      に「KNOW-324 で Observer/Reflector 統合に再設計済み (--observe opt-in)」の
      注記が追加されている

## Constraints

- 実装変更なし (KNOW-305 + KNOW-323 で完了済み)
- ESM only、相対 import は `.js`
- PR は develop ターゲット、内部チケット ID をユーザ向けドキュメントに含めない
  (spec ディレクトリ名のみ許容)

## Affected Packages

- [ ] `@knowledgine/core` (実装変更なし、spec 参照のみ)
- [ ] `@knowledgine/cli` (実装変更なし、spec 参照のみ)
- [ ] `@knowledgine/ingest`
- [ ] `@knowledgine/mcp-server`
- [ ] `@knowledgine/mcp-memory-protocol`

(本 PR は spec + docs のみで code 変更なし)

## Out of Scope

- Observer / Reflector 自体の機能追加 (causal link, novelty score など) は
  別チケットで対応
- `rcConfig.observer.{enabled,limit}` の設定 UI / CLI フラグ追加
- Observer の always-on 化 (現状 opt-in を維持)

## Prior Art / References

- 元実装: KNOW-305 (Done) — 旧来の単独自動実行
- 統合実装: KNOW-323 (Done) — Observer 経由への再設計と opt-in 切替
- ソース: `packages/core/src/agents/observer-agent.ts`,
  `packages/cli/src/commands/ingest.ts:522-568`
- テスト: `packages/cli/tests/commands/ingest-observe.test.ts`,
  `packages/core/tests/agents/observer-agent.test.ts`
