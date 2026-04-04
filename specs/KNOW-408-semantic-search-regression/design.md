# KNOW-408 Design

## Overview

- `KnowledgeRepository` に vector index の状態確認と backfill を集約する。
- semantic / hybrid 検索の直前に、`note_embeddings` から `note_embeddings_vec` への欠損同期を自動実行する。
- readiness / coverage 表示は `note_embeddings_vec` を真実のソースに切り替える。

## Interfaces

- `KnowledgeRepository.getVectorIndexStats(): { vecAvailable: boolean; embeddingRows: number; vectorRows: number; missingVectorRows: number }`
- `KnowledgeRepository.syncMissingVectorsFromEmbeddings(): number`

## Data Flow

1. semantic / hybrid search 開始時に `getVectorIndexStats()` を確認する。
2. `missingVectorRows > 0` かつ vec が利用可能なら `syncMissingVectorsFromEmbeddings()` を実行する。
3. その後に通常の `searchByVector()` を実行する。
4. `checkSemanticReadiness()` / `status` / `doctor` / `embed-missing` は `vectorRows` を coverage の基準に使う。

## Design Decisions

- backfill SQL は既存 `upgrade --semantic` の実装を repository へ移す。
- `status` は表示のみで DB を修復しない。
- 検索パス側で自動修復することで CLI / serve / orchestrator 経由の semantic 検索を一括で救済する。

## Migration Strategy

- スキーマ migration は追加しない。
- 既存 DB は検索時または `embed-missing` / `upgrade --semantic` 実行時に段階的に修復する。
