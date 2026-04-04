# KNOW-408: semantic検索が0件を返す回帰バグ修正

## Problem Statement
- `knowledgine search --mode semantic` が、`note_embeddings` に埋め込みが存在していても常に 0 件を返すケースがある。
- `status` / `doctor` / `embed-missing` は `note_embeddings` の存在だけを見て semantic ready と判断しており、実際に検索で使う `note_embeddings_vec` の欠損を検知できていない。
- v0.6.4 で追加された embedding coverage / `--embed-missing` フローの影響で、semantic 検索が壊れていても「Ready」に見えるのが問題。

## Acceptance Criteria
- `note_embeddings` は存在するが `note_embeddings_vec` が欠損している DB で、semantic search 実行時に vector index が復元され、検索結果が返る。
- `status` と `checkSemanticReadiness()` は `note_embeddings_vec` 基準で readiness / coverage を計算する。
- `knowledgine ingest --embed-missing` は、未埋め込みノートが 0 件でも vector index 欠損があれば復元する。
- keyword 検索の挙動は変えない。
- Graph / rerank / hybrid など既存検索パスの public interface は変えない。

## Constraints
- P0 のため最小修正にとどめる。
- `semantic-searcher.ts` / `hybrid-searcher.ts` の score 変換式は、原因でない限り変更しない。
- sqlite-vec がロードできない環境では従来どおり graceful degradation を維持する。

## Affected Packages
- `packages/core`
- `packages/cli`

## Out of Scope
- embedding モデル変更
- 検索ランキング改善
- semantic score の再設計
