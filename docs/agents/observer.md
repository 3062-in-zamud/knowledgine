# Observer / Reflector Agent

knowledgine の **Observer Agent** は ingest 直後にノートを観察し、6 ベクトル分類
(personal_info / preferences / events / temporal_data / updates / assistant_info)、
パターン (daily / ticket セクション内の problem / solution / learning / time)、
エンティティ (frontmatter, imports, markdown links, inline code, mentions, org/repo)
を抽出するポストプロセッサです。**Reflector Agent** はその出力から矛盾と失効候補
を検出します。

両エージェントは **opt-in** です: `--observe` フラグまたは
`.knowledginerc.json` の `observer.enabled: true` を指定したときのみ起動します。

## 何が抽出されるか

| Step             | 抽出内容                                                                                                                                              | 担当               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1. Pattern       | daily / ticket セクション (`## Problem` / `## Solution` / `## Learning` 等) から problem / solution / learning / time の 4 種を抽出 (ID 抽出ではない) | `PatternExtractor` |
| 2. Entity        | frontmatter (tags + 指定 fields) / imports / markdown links / inline code / mentions / org/repo (ファイルパスは entity 抽出前に strip)                | `EntityExtractor`  |
| 3. Rule classify | 上記から 6 ベクトル分類 (rule-based)                                                                                                                  | Observer 内部      |
| 4. LLM 補完      | LLM provider 設定時のみ; rule-based 分類を補強 / 修正                                                                                                 | `LLMProvider`      |
| 5. Reflection    | 出力から `contradictions` と `deprecationCandidates` を検出                                                                                           | `ReflectorAgent`   |

LLM が未設定なら **rule-based モード** で動作し、LLM が無くても主要パターンと
エンティティは抽出されます。

## いつ使うか

| 用途                                       | 推奨                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| 大量取り込み (例: GitHub repo の全 commit) | **Off** (デフォルト)。Observer/Reflector は逐次処理で時間がかかるため |
| 知識の質を上げたい (causal link, 矛盾検出) | **On**: `--observe` を付ける                                          |
| LLM 経由のリッチ抽出を試す                 | **On** + `.knowledginerc.json` で `llm` プロバイダ設定                |
| CI 上での ingest                           | **Off** (LLM 課金や処理時間の予測不能性を避ける)                      |

## CLI 使用例

```bash
# 基本: --observe を付けると ingest 後に Observer/Reflector が起動
knowledgine ingest --source markdown --observe --path ~/notes

# 観察対象ノート数の上限を指定 (デフォルト 50)
knowledgine ingest --source markdown --observe --observe-limit 200 --path ~/notes

# .knowledginerc.json で常時有効化
# {
#   "observer": { "enabled": true, "limit": 50 },
#   "llm": { "provider": "...", ... }   # 任意。未設定なら rule-based
# }
```

## ingest フローへの統合点

```
ingest plugin → IngestEngine.ingest() → uniqueIngestedNoteIds
                                                │
                                  (--observe / observer.enabled)
                                                │
                                                ▼
                            ObserverAgent.observeBatch(notes)
                                ├─ PatternExtractor.extractDailyPatterns
                                ├─ PatternExtractor.extractTicketPatterns
                                ├─ EntityExtractor.extract
                                └─ classify into 6 vectors
                                                │
                                                ▼
                            ReflectorAgent.reflectBatch(observerOutputs)
                                ├─ contradictions
                                └─ deprecationCandidates
```

実装: [`packages/cli/src/commands/ingest.ts`](../../packages/cli/src/commands/ingest.ts)
(行 522 〜) + [`packages/core/src/agents/observer-agent.ts`](../../packages/core/src/agents/observer-agent.ts)。

## 出力先 (重要 — 自動 persist されません)

Observer / Reflector の `observeBatch` / `reflectBatch` は **in-memory の解析
結果** を返すだけで、knowledgebase への自動書き込みは行いません。CLI ingest
ブロックは結果の件数を stderr に log するのみで、`KnowledgeRepository` 経由の
書き込みは発生しません。

DB を実際に変更するのは `ReflectorAgent.applyApprovedDeprecations(candidates)`
のような **明示的な適用処理** が呼ばれた場合のみです (現状 CLI からはまだ自動
呼び出しされていません)。Observer の 6 ベクトル分類やパターンを永続化したい
場合は、別途 `KnowledgeRepository` 側に書き込みパスを実装する必要があります。

実装の詳細は
[`observer-agent.ts`](../../packages/core/src/agents/observer-agent.ts) と
[`reflector-agent.ts`](../../packages/core/src/agents/reflector-agent.ts) を参照。

## トラブルシューティング

| 症状                                                                 | 原因 / 対処                                                                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Observer running in rule-based mode (no LLM configured)` と出る     | 想定動作。LLM プロバイダ未設定時のフォールバック                                                                                                          |
| `Observer: processed 0 notes`                                        | 新規 ingest 対象が 0 件 (= 既に取り込み済み)、または `--observe-limit 0` で空スライスになった可能性。再取り込みしたい場合は `--full` で cursor をリセット |
| 処理時間が長い                                                       | `--observe-limit` を絞る / LLM を無効化する / そもそも `--observe` を外す                                                                                 |
| Reflector が `0 contradictions, 0 deprecation candidates` ばかり返す | 知識量が少ないと検出されないのが正常。蓄積後に再評価可能                                                                                                  |

## 関連 spec

- [Observer / Reflector 統合 spec](../../specs/) — 本ガイドの根拠 spec、抽出
  経路と `--observe` opt-in の設計判断を記載
- [Pattern Extractor 実装](../../packages/core/src/extraction/pattern-extractor.ts)
- [Entity Extractor 実装](../../packages/core/src/graph/entity-extractor.ts)
- [Observer Agent 実装](../../packages/core/src/agents/observer-agent.ts)
- [Reflector Agent 実装](../../packages/core/src/agents/reflector-agent.ts)
