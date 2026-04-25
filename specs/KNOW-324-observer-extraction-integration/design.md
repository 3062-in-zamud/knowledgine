# Design: Observer/Reflector integration with pattern/entity extractors

## Ticket ID

KNOW-324

## Architecture Overview

```
┌──────────────────┐
│ knowledgine CLI  │  knowledgine ingest --source <id> --observe --path <dir>
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐    1. emits NormalizedEvent → KnowledgeNote
│ IngestEngine.ingest()│
└────────┬─────────────┘
         │  uniqueIngestedNoteIds
         ▼
┌────────────────────────────────────────┐  (gate: options.observe ?? rcConfig.observer.enabled ?? false)
│ ObserverAgent.observeBatch(notes)      │  ← deps: { patternExtractor, entityExtractor, llmProvider?, repository }
│   for each note (in-memory only):      │
│     extractDailyPatterns(content)      │
│     extractTicketPatterns(content)     │
│     extractEntities(content, fm)       │
│     classify into 6 vectors            │
│   ※ no DB writes from observeBatch    │
└────────┬───────────────────────────────┘
         │  observerOutputs
         ▼
┌────────────────────────────────────────┐
│ ReflectorAgent.reflectBatch(outputs)   │  ← contradictions / deprecation candidates (read-only)
│                                        │  ※ DB mutation only via explicit applyApprovedDeprecations()
└────────────────────────────────────────┘
```

## Data Flow

1. ユーザが `knowledgine ingest --source <id> --observe --path <kb>` を実行
2. `ingestCommand` (cli/src/commands/ingest.ts) が plugin を選択し
   `engine.ingest(pluginId, sourcePath, opts)` を呼ぶ → 新規 note の id を
   `uniqueIngestedNoteIds` に蓄積
3. `shouldObserve = options.observe ?? rcConfig.observer.enabled ?? false` を
   評価 (line 522)
4. `shouldObserve === true` の場合:
   - `PatternExtractor` / `EntityExtractor` をインスタンス化 (line 541-542)
   - `ObserverAgent` を deps 付きで構築 (line 543-548)
   - `observer.observeBatch(notes)` でバッチ抽出 (line 553)
   - `ReflectorAgent.reflectBatch(observerOutputs)` で矛盾 / 失効候補抽出
5. `shouldObserve === false` の場合: Observer / Reflector ブロックは skip され
   ingest engine の出力 (events + notes) のみが永続化される (= 既存挙動)

## Key Design Decisions (snapshot — implemented in KNOW-305 + KNOW-323)

### Decision 1: Pattern + Entity 抽出は Observer の責務

- **Chosen**: `PatternExtractor` / `EntityExtractor` を `ObserverAgent` の
  必須 deps として注入する
- **Alternatives considered**:
  - ingest engine 内に直接組み込む → 高速だが LLM 連携 (rule-based fallback) と
    抽出ロジックが engine に流入し責務が肥大化
  - 別エージェント (`ExtractorAgent`) を新設 → Observer / Reflector との
    通信が増え複雑度上昇
- **Rationale**: Observer は「ingest 後にノートを観察し meta 情報を抽出する」
  役割で、pattern / entity 抽出は同じ抽象レベル。同一エージェントに集約する
  ことで LLM 経由 / rule-based の切替が単一箇所で管理できる

### Decision 2: `--observe` opt-in (always-on にしない)

- **Chosen**: `--observe` フラグまたは `rcConfig.observer.enabled = true` の
  ときのみ Observer を起動 (KNOW-323 で確定)
- **Alternatives considered**: always-on → 大量取り込み時に LLM 課金 / 処理
  時間が予測不能になる
- **Rationale**: Observer は LLM 連携 (任意) と抽出処理を含み、ユーザが意識
  して有効化する場面 (Reflection 強化、causal link 抽出) でのみ走るのが妥当

### Decision 3: 旧 KNOW-305 を Cancelled ではなく Done のまま参照

- **Chosen**: 旧タスク KNOW-305 (`ingest時パターン抽出とエンティティ抽出の自動
実行`) は既に `ticket_status: Done` (実装は KNOW-305 で landed)。本 KNOW-324
  では Cancelled に変更せず、本 spec へのクロスリンクと注記を tasks/ 側に追記
  する
- **Alternatives considered**: KNOW-305 を Cancelled に変更 → 履歴が失われ、
  実装の系譜 (KNOW-305 → KNOW-323 → KNOW-324) が追えなくなる
- **Rationale**: チケットの正確な系譜を保つことが将来のオンボーディングや
  knowledge base 向上に資する

## Migration Strategy

N/A (本 PR は spec + docs のみ)

## Security Considerations

- 既存実装が `sanitizeContent` 経由で書き込む note を Observer が読むので、
  Observer が新たに secret leak を引き起こすリスクはない
- LLM 連携時はノート content がプロバイダ側に送信される。これは既知の
  trade-off で `rcConfig.llm` 設定で明示する

## Testing Strategy

既存テストの参照のみ (新規追加なし):

- `packages/core/tests/agents/observer-agent.test.ts` (600 行) — Observer 単体
- `packages/cli/tests/commands/ingest-observe.test.ts` — `--observe` opt-in
- `packages/core/tests/agents/reflector-agent.test.ts` — Reflector 単体

## Dependencies

- New dependencies: なし
- Modified packages: なし (本 PR はドキュメントのみ)
