# Requirements: DB Storage Optimization

## Ticket ID

KNOW-404

## Status

draft

## Problem Statement

Running `knowledgine init --github honojs/hono` (and similar small-to-medium
GitHub repositories) currently produces a `.knowledgine/index.sqlite` file of
roughly **16 MB** for only 100 commits + 50 issues — over half the size of the
underlying repository. At scale (large GitHub repos, multi-source ingest) this
trajectory leads to multi-GB databases that block adoption in B2D scenarios and
make `knowledgine` unattractive for everyday developer machines.

Investigation shows three compounding causes:

1. `note_embeddings.embedding` stores **float32** vectors (1,536 B per 384-dim
   vector); plus a duplicate copy in the `note_embeddings_vec` virtual table.
2. SQLite is using its defaults: `auto_vacuum=NONE`, `page_size=4096`,
   `synchronous=FULL`, and the WAL is rarely checkpointed. Free pages and FTS5
   shadow tables accumulate unbounded.
3. The `status` command shows total DB size only, so users (and we) cannot tell
   which subsystem is the offender.

This spec addresses all three by introducing int8 embedding quantization, tuning
SQLite PRAGMAs, and exposing per-category storage breakdown on `status`.

## Acceptance Criteria

- [ ] **AC-1**: After `knowledgine init && knowledgine ingest --source github`
      on `honojs/hono` (100 commits + 50 issues, ingest only — no extra sources),
      the resulting `.knowledgine/index.sqlite` file is **≤ 10 MB**. The same must
      hold for `encode/httpx`. Verified by manual ingest in Phase 4 Gate B.

- [ ] **AC-2**: `knowledgine status --path <p>` displays the total DB size and
      a per-category breakdown including at minimum **FTS**, **embeddings**, and
      **graph** lines (the design adds `notes`, `events`, `memory`, `other`,
      `freelist`, `wal` for completeness). Category sums match the on-disk
      database size within ±10 %.

- [ ] **AC-3**: `docs/benchmarks/db-storage-v2.md` exists and records the
      baseline DB size, the post-migration DB size, the reduction percentage, the
      `recall@10` measurement, the sample repositories with pinned commit SHAs,
      the host OS/CPU/RAM, the Node.js version, the `better-sqlite3` and
      `sqlite-vec` versions, the embedding model name and dimensionality, the
      measurement timestamp, and the exact reproduction commands.

- [ ] **AC-4**: A benchmark in `packages/core/tests/benchmark/` measures the
      effect of int8 quantization on retrieval quality. Mean Jaccard@10 between
      the float32 baseline and the **rerank-from-BLOB** path (vec0 INT8 coarse
      KNN with `k = 10 × topK`, then exact float32 distances on the candidate
      set), over 100 queries against a 1000-vector cluster-structured synthetic
      corpus, must be **≥ 0.95** (recall@10 degradation < 5 percentage points).
      The longmemeval-derived recall on real embeddings must also be recorded
      in `docs/benchmarks/db-storage-v2.md`.

  Spike rationale: a Phase 2.0 measurement with no rerank step plateaus at
  Jaccard@10 ≈ 0.83–0.87 across noise levels. Reranking from the float32
  BLOB recovers the missing precision because the vec0 INT8 candidate set
  is wide enough (10×) to almost always contain the true top-K.

- [ ] **AC-5**: `pnpm verify` passes locally on **both Node 20 and Node 22**,
      and the GitHub Actions CI on the resulting PR is fully green
      (`benchmark` job's `continue-on-error: true` neutral/skip is acceptable).

## Constraints

- **Performance**:
  - migration021 must keep the migration time below ~1 s for the AC-1 dataset
    (150 notes). For databases larger than 50 MB the migration MUST skip
    `VACUUM` and emit a warning to avoid multi-second startup blocks.
  - `getStorageBreakdown()` must complete in <100 ms on the AC-1 dataset.
- **Compatibility**:
  - The migration is **forward-only**. Downgrading the CLI after migration021
    requires re-embedding (documented in CHANGELOG).
  - `--no-semantic` mode must remain functional; migration021 must be a no-op
    when `note_embeddings` is empty.
  - The migration must be idempotent: re-running on an already-migrated DB
    must be a no-op.
- **Security**:
  - No new dependencies. No new network calls.
  - Migration logs MUST NOT include note content; only counts and IDs.

## Affected Packages

- [x] `@knowledgine/core` (storage, migrations, repository, embedding paths)
- [x] `@knowledgine/cli` (`status` command rendering)
- [ ] `@knowledgine/mcp-server` (no code change; migrations run via core)
- [ ] `@knowledgine/ingest`
- [ ] `@knowledgine/mcp-memory-protocol`

## Out of Scope

- Lazy migration for very large databases (> 50 MB). Such databases skip the
  VACUUM step and continue to function; manual `VACUUM` remains an option but
  no new CLI command is shipped here.
- A `status --json` machine-readable output mode. (Future work; current output
  remains text.)
- Index pruning. May be added in Phase 1.5 if breakdown data shows index
  bloat is the dominant cost; otherwise deferred.
- Asymmetric (zero-point) quantization. Symmetric `scale = max(|v|)` is shown
  to be sufficient for AC-4 in the design phase.
- Automatic DB backup before migration021. Documented as a recommendation,
  not implemented.

## Prior Art / References

- Original task brief: `~/workspaces/dev-butler/projects/knowledgine/tasks/`
  (internal planning doc; not part of the public repository).
- Plan: `/Users/ren0826nosuke/.claude/plans/know-404-db-staged-fox.md`
- sqlite-vec INT8 column type: see `packages/core/package.json`'s pinned
  `sqlite-vec` version. Spike confirmed `vec_int8(?)` SQL wrapper is
  required for both `INSERT` and `MATCH`.
- Concurrent work: branch `feat/know-403-cross-project-search` modifies
  `cli/commands/search.ts` and search internals; its scope does not overlap
  with this spec except in `README.md` and `CHANGELOG.md` `## [Unreleased]`.
