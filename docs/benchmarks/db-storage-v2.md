# DB Storage v2 — int8 Mirror with Float32 Rerank

This document records the storage and retrieval-quality measurements for
the `embedding_int8_quantization` change. Spec source of truth:
`specs/KNOW-404-db-storage-optimization/`.

## Summary

- The vec0 mirror table (`note_embeddings_vec`) switches from `FLOAT[384]`
  to `INT8[384]`.
- The float32 BLOB column on `note_embeddings.embedding` is unchanged and
  remains the canonical embedding store.
- `searchByVector` now performs a coarse `MATCH vec_int8(?) AND k = 10×topK`
  on the int8 mirror, then reranks the candidate set against the float32
  BLOBs to recover float32-grade KNN ordering.
- A few SQLite PRAGMAs were tuned (`synchronous=NORMAL`, `cache_size=-20000`)
  alongside the migration.

## Environment

| Field                 | Value                                       |
| --------------------- | ------------------------------------------- |
| Host CPU              | Apple Silicon (arm64)                       |
| Host RAM              | 32 GB                                       |
| OS                    | macOS 25.3 (Darwin 25.3.0)                  |
| Node.js               | 22.22.2                                     |
| `better-sqlite3`      | ^11.0.0 (resolved 11.10.0)                  |
| `sqlite-vec`          | ^0.1.6                                      |
| Embedding model       | `all-MiniLM-L6-v2` (384-dim, L2-normalized) |
| Measurement timestamp | 2026-04-25                                  |

## Synthetic-fixture measurements (CI-stable)

The CI bench in
`packages/core/tests/benchmark/db-size-bench.test.ts` writes the same
seeded 150-note (100 commit-like + 50 issue-like) corpus to two
databases:

- **baseline**: every migration up to `migration020` applied; `vec0
FLOAT[384]` table; embeddings inserted as raw float32 BLOBs.
- **optimized**: full `ALL_MIGRATIONS` (including `migration021`) and the
  production `saveEmbeddingBatch` path which quantizes via the uniform
  1/127 scale and uses `vec_int8(?)` to populate `vec0 INT8[384]`.

Both runs end with `PRAGMA wal_checkpoint(TRUNCATE)` so file size is
directly comparable.

| Metric              | Baseline (float32 vec0) |  Optimized (INT8 vec0) |     Ratio |
| ------------------- | ----------------------: | ---------------------: | --------: |
| `index.sqlite` size |  ~2.49 MB (2,543,616 B) | ~1.30 MB (1,359,872 B) | **0.535** |

Reduction on the synthetic fixture: **~46.5 %**.

## Recall measurement (CI bench)

`packages/core/tests/benchmark/quantization-recall-bench.test.ts` builds
a 1000-vector cluster-structured corpus (10 cluster centers, 0.15
Gaussian noise, L2-normalized) and issues 100 queries against both:

- a parallel `vec0 FLOAT[384]` baseline table (top-10 KNN), and
- `KnowledgeRepository.searchByVector` on the migration021 corpus
  (coarse INT8 KNN with `k = 100`, then float32 rerank).

| Metric                             |      Value |  Floor |
| ---------------------------------- | ---------: | -----: |
| Mean Jaccard@10 across 100 queries | **1.0000** | ≥ 0.95 |

The rerank step recovers float32-grade ordering for every query in the
synthetic set. A pure-int8 KNN without reranking plateaus at Jaccard@10
≈ 0.85 — see Phase 2.0 spike notes in `requirements.md`.

## Real-world measurements (Phase 4 Gate B)

The synthetic numbers above act as a regression guard. AC-1 (≤ 10 MB on
real GitHub data) is verified by running an actual ingest of two pinned
public repositories with `--limit 100` (which caps both PRs and issues
to 100 each; the GitHub plugin also pulls associated PR comments).

| Repository     | Commit SHA at ingest |                      Items ingested (notes) | Optimized DB size | AC-1 (≤ 10 MB) |
| -------------- | -------------------- | ------------------------------------------: | ----------------: | -------------: |
| `honojs/hono`  | `f774f8df`           | 289 (100 PRs + 100 issues + 89 PR comments) |        **6.3 MB** |        ✅ pass |
| `encode/httpx` | `b5addb64`           |              145 (100 PRs + 45 PR comments) |        **5.7 MB** |        ✅ pass |

The runs were performed on `feat/know-404-db-storage-optimization` after
all migrations (including `migration021` and `--semantic` enabled so the
INT8 vec0 mirror was actually populated). The status command's
per-category breakdown (AC-2 evidence) on the honojs/hono run:

```
Database
  Path:         .knowledgine/index.sqlite (6.3 MB)
  Notes:        289 indexed
    pull requests  100
    issues         100
    PR comments    89
  Patterns:     93 extracted
  Embeddings:   289/289 (100%) generated
  Breakdown:
    notes           627.7 KB
    fts             2.9 MB
    embeddings      986.5 KB
    graph           211.9 KB
    events          1.1 MB
    memory          20.0 KB
    other           476.6 KB
    wal             8.1 KB
```

The `embeddings` bucket includes both the canonical float32 BLOB
(289 × 1.5 KB ≈ 423 KB) and the INT8 vec0 mirror (~563 KB including
sqlite-vec overhead) — exactly the Case A layout described above.

`recall@10` on real ONNX embeddings has not been re-measured for this
PR; the synthetic Jaccard@10 = 1.0000 is the CI gate, and the rerank
step provably collapses to the float32 baseline ordering in any case
where the candidate set covers the true top-K (≥ 10 oversampled at
default settings).

## Reproduction

### CI benches (no network, no model files)

```bash
# from repo root, after `pnpm install`
volta run --node 22 pnpm --filter @knowledgine/core test:run \
    tests/benchmark/db-size-bench.test.ts \
    tests/benchmark/quantization-recall-bench.test.ts
```

### Real-repo end-to-end (Gate B)

```bash
# Build the CLI from the worktree
volta run --node 22 pnpm --filter @knowledgine/cli build

# 1) honojs/hono
node packages/cli/dist/cli.js init   --path /tmp/know404-hono
node packages/cli/dist/cli.js ingest --path /tmp/know404-hono \
    --source github --repo honojs/hono
ls -lh /tmp/know404-hono/.knowledgine/index.sqlite
node packages/cli/dist/cli.js status --path /tmp/know404-hono

# 2) encode/httpx
node packages/cli/dist/cli.js init   --path /tmp/know404-httpx
node packages/cli/dist/cli.js ingest --path /tmp/know404-httpx \
    --source github --repo encode/httpx
ls -lh /tmp/know404-httpx/.knowledgine/index.sqlite
node packages/cli/dist/cli.js status --path /tmp/know404-httpx

# 3) Recall on real ONNX embeddings
volta run --node 22 pnpm benchmark:longmemeval:quick
```

The two `ls -lh` outputs and the two `status` outputs (showing the
per-category breakdown) are pasted into the PR description before
moving the PR out of draft.

## Notes on the design choices

- **Why uniform 1/127 scale and not per-vector**: sqlite-vec's
  `INT8[N]` virtual table does not store per-row scales; two vectors
  quantized with different scales become incomparable for KNN distance.
  The uniform scale relies on every embedding being L2-normalized so
  each component already lies in `[-1, 1]`.
- **Why `AND k = ?` is required**: without it, sqlite-vec returns rows
  from the int8 mirror in undefined order with `distance = NULL`.
- **Why rerank from BLOB and not store an int8-only index**: pure int8
  KNN plateaus at Jaccard@10 ≈ 0.85 even with cluster structure. The
  rerank step on a 10× oversampled candidate set recovers float32-grade
  ordering at negligible CPU cost (O(k × dim) per query).
- **Forward-only migration**: `down()` is a no-op; reverting requires
  re-embedding via the existing `--embed-missing` flow.
