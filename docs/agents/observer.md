# Observer / Reflector Agent

knowledgine の **Observer Agent** は ingest 直後にノートを観察し、6 ベクトル分類
(personal_info / preferences / events / temporal_data / updates / assistant_info)、
パターン (daily / ticket)、エンティティ (file paths / functions / etc.) を抽出する
ポストプロセッサです。**Reflector Agent** はその出力から矛盾と失効候補を検出します。

両エージェントは **opt-in** です: `--observe` フラグまたは
`.knowledginerc.json` の `observer.enabled: true` を指定したときのみ起動します。

## 何が抽出されるか

| Step             | 抽出内容                                                                     | 担当               |
| ---------------- | ---------------------------------------------------------------------------- | ------------------ |
| 1. Pattern       | デイリーパターン (日付・時間情報) / チケットパターン (`KNOW-XXX`, `#123` 等) | `PatternExtractor` |
| 2. Entity        | ファイルパス / 関数名 / 識別子 / frontmatter エンティティ                    | `EntityExtractor`  |
| 3. Rule classify | 上記から 6 ベクトル分類 (rule-based)                                         | Observer 内部      |
| 4. LLM 補完      | LLM provider 設定時のみ; rule-based 分類を補強 / 修正                        | `LLMProvider`      |
| 5. Reflection    | 出力から `contradictions` と `deprecationCandidates` を検出                  | `ReflectorAgent`   |

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

## 出力先

Observer / Reflector の出力は `KnowledgeRepository` 経由で同じ knowledgebase に
書き込まれます (新規ノートではなく既存ノートのメタデータを補強する形)。
詳細は [`observer-agent.ts`](../../packages/core/src/agents/observer-agent.ts) と
[`reflector-agent.ts`](../../packages/core/src/agents/reflector-agent.ts) を参照。

## トラブルシューティング

| 症状                                                                 | 原因 / 対処                                                                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Observer running in rule-based mode (no LLM configured)` と出る     | 想定動作。LLM プロバイダ未設定時のフォールバック                                                                 |
| `Observer: processed 0 notes`                                        | ingest 自体が 0 件か、`--observe-limit` がノート数より少ない可能性。再 ingest 時は `--full` で cursor をリセット |
| 処理時間が長い                                                       | `--observe-limit` を絞る / LLM を無効化する / そもそも `--observe` を外す                                        |
| Reflector が `0 contradictions, 0 deprecation candidates` ばかり返す | 知識量が少ないと検出されないのが正常。蓄積後に再評価可能                                                         |

## 関連 spec

- [KNOW-305: ingest 時パターン抽出と…](../../specs/_archived/) (元実装、Done)
- [KNOW-323: Observer/Reflector opt-in 切替](../../specs/) (Done、`--observe` 導入)
- [KNOW-324: Observer/Reflector integration](../../specs/KNOW-324-observer-extraction-integration/)
  (本ドキュメント; spec 整合の housekeeping)
