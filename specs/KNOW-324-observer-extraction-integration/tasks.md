# Tasks: Observer/Reflector integration with pattern/entity extractors

## Ticket ID

KNOW-324

## Prerequisites

- [x] KNOW-305 (Done) — ingest 時の pattern / entity 自動実行が landed 済み
- [x] KNOW-323 (Done) — Observer / Reflector の opt-in 切替が landed 済み
- [x] Feature branch + worktree: `.worktrees/know-324-observer-integ` /
      `feat/know-324-observer-integ`

## Implementation Tasks

このチケットは housekeeping 系で、新規実装はゼロ。spec / docs / 旧タスクへの
注記が成果物となる。

### Phase 1: SDD spec

- [x] **Task 1**: `specs/KNOW-324-observer-extraction-integration/requirements.md`
- [x] **Task 2**: `specs/KNOW-324-observer-extraction-integration/design.md`
- [x] **Task 3**: `specs/KNOW-324-observer-extraction-integration/tasks.md`

### Phase 2: User-facing docs

- [x] **Task 4**: `docs/agents/observer.md` を新規作成
  - Observer Agent / Reflector Agent の役割
  - PatternExtractor / EntityExtractor との関係
  - `--observe` opt-in と `rcConfig.observer.{enabled,limit}` の設定方法
  - rule-based vs LLM 連携の差異 (rule-based fallback の挙動)
  - `--observe-limit <n>` の意味とデフォルト 50
- [x] **Task 5**: `README.md` の使い方セクションに `--observe` の例を追加

### Phase 3: dev-butler 側のクロスリンク (本 PR スコープ外)

- [ ] **Task 6**: `dev-butler/projects/knowledgine/tasks/ingest時パターン抽出と
エンティティ抽出の自動実行.md` (KNOW-305) に「KNOW-324 で Observer/Reflector
      統合に再設計済み (--observe opt-in)」の注記追記。本 PR が merge された後に
      別作業として実施

## Verification Checklist

- [ ] AC-1 〜 AC-8 すべて緑 (実装は既存、本 PR では spec / docs / 注記のみ)
- [ ] `pnpm verify` 全緑 (code 変更ゼロなので前回 develop tip と同等)
- [ ] 内部チケット ID `KNOW-324` がコミット・PR 本文・README から除外されている
      (spec ディレクトリ名のみ許容)

## Notes

- 実装は KNOW-305 (Done) + KNOW-323 (Done) で完結している。本チケットは
  仕様の明文化と user-facing ドキュメントの追加のみ
- `docs/agents/observer.md` は将来 KNOW-340 (MCP Memory Protocol) で追加予定の
  capability 表とは独立したエージェント運用ガイド
