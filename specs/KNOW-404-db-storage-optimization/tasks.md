# Tasks: DB Storage Optimization

## Ticket ID

KNOW-404

## Prerequisites

- [x] Spec reviewed (requirements.md + design.md)
- [x] Feature branch created: `feat/know-404-db-storage-optimization`
- [x] Worktree at `.worktrees/know-404-db-storage-optimization`
- [x] Dependencies installed (`pnpm install --frozen-lockfile`)

## Implementation Tasks

### Phase 1: PRAGMA + status breakdown (AC-2 standalone)

- [ ] **T1.1** [RED] `packages/core/tests/storage/storage-breakdown.test.ts`:
      `getStorageBreakdown()` returns category bytes; sum reconciles with
      `page_count * page_size` (within freelist tolerance); fallback path when
      `dbstat` is unavailable.
- [ ] **T1.2** [GREEN] Implement `packages/core/src/storage/storage-categories.ts`
      and `KnowledgeRepository.getStorageBreakdown()`.
- [ ] **T1.3** [RED] `packages/cli/tests/commands/status-breakdown.test.ts`:
      output contains `notes`, `fts`, `embeddings`, `graph`, `events`,
      `memory`, `other` lines.
- [ ] **T1.4** [GREEN] Extend `packages/cli/src/commands/status.ts` Database
      section with the breakdown rendering.
- [ ] **T1.5** [RED] `packages/core/tests/storage/database.test.ts`: assert
      `synchronous = 1 (NORMAL)` and `cache_size = -20000` on a fresh DB.
- [ ] **T1.6** [GREEN] Add the PRAGMAs to `packages/core/src/storage/database.ts`.
      `page_size = 8192` is set only for newly-created files.
- [ ] **T1.7** Run `pnpm verify` on Node 20 and Node 22.

### Phase 1.5: Breakdown gate (informational)

- [ ] **T1.8** Run a small honojs/hono ingest (or synthetic fixture). Record
      the breakdown numbers. Confirm whether quantization + PRAGMA alone hit
      AC-1, or whether index pruning needs to be added.

### Phase 2: int8 quantization with float32 rerank (AC-1 key)

Phase 2.0 spike findings (informs the design):

- `vec_int8(?)` SQL wrapper is **required** for both INSERT and MATCH
  against `INT8[N]` vec0 tables. Raw int8 buffers without the wrapper
  raise `Query vector for the "embedding" column is expected to be of
type int8`.
- vec0 KNN requires `AND k = ?` in the WHERE clause; without it the
  virtual table returns rows with `distance = NULL` in undefined order.
- Per-vector scale (`max(|v|)`) does NOT work — sqlite-vec does not store
  per-row scales, so two vectors quantized with different scales become
  incomparable. **Uniform scale 1/127** is required.
- Even with uniform scale, a pure int8 KNN plateaus at Jaccard@10 ≈ 0.85,
  below AC-4. **Rerank from the float32 BLOB on a 10× oversampled
  candidate set** is therefore part of the design.

- [x] **T2.0** SPIKE — completed. See above findings.
- [ ] **T2.1** [RED] `packages/core/tests/storage/quantization.test.ts`:
      uniform quantization is symmetric, idempotent in the round-trip
      sense (`dequant(quant(v)) ≈ v` within 1/127), and clamps out-of-
      range values without throwing.
- [ ] **T2.2** [GREEN] Implement `packages/core/src/storage/quantization.ts`
      (`quantizeFloat32ToInt8`, `dequantizeInt8`; uniform scale 1/127).
- [ ] **T2.3** [RED] `packages/core/tests/storage/migration-021.test.ts`: - After migration, `note_embeddings_vec` reports `INT8[384]` column type. - The `note_embeddings.embedding` BLOB is unchanged (still float32). - `searchByVector(Float32Array)` returns ranked hits (internal
      coarse vec0 INT8 KNN + float32 rerank). - Idempotent: re-running migration021 detects existing INT8[384]
      and skips the rebuild. - No-op on an empty `note_embeddings`. - Dimension-mismatch rows are skipped with a warning, never block. - Synthetic DB > 50 MB triggers the VACUUM-skip warning path. - Binding a raw `Float32Array` Buffer to the new vec0 errors out
      (regression guard for the `vec_int8(?)` requirement).
- [ ] **T2.4** [GREEN] Implement
      `packages/core/src/storage/migrations/021_embedding_int8_quantization.ts`.
      DROP/CREATE the vec0 mirror as `INT8[384]`; chunked re-INSERT from
      the float32 BLOBs via `vec_int8(?)`; size-guarded VACUUM.
- [ ] **T2.5** [GREEN] Update
      `packages/core/src/storage/knowledge-repository.ts`: - `saveEmbedding()` and `saveEmbeddingBatch()` keep writing the
      float32 BLOB unchanged AND insert the int8-quantized mirror via
      `vec_int8(?)`. - `searchByVector()` runs a coarse vec0 INT8 KNN with `AND k = ?`
      (k = `OVERSAMPLE × topK`, default 10×, capped at 100), then reads
      the candidates' float32 BLOBs and reranks by exact L2.
- [ ] **T2.6** [GREEN — 🔴 critical] Update the runtime DDL emitted by
      `ensureVectorIndexTable()` (and any other place that recreates
      `note_embeddings_vec`) to declare `INT8[384]`. Sweep with
      `rg "FLOAT\[384\]" packages/core/src` to confirm zero residue.
- [ ] **T2.7** [RED→GREEN] Adjust
      `packages/core/tests/storage/knowledge-repository.test.ts` for the
      new SQL forms; add a test that `ensureVectorIndexTable()` emits
      `INT8[384]` and that `searchByVector` exercises the rerank path.
- [ ] **T2.8** Register migration021 in
      `packages/core/src/index.ts`'s `ALL_MIGRATIONS`. Re-export
      quantization helpers as needed.
- [ ] **T2.9** Run `pnpm verify` on Node 20 and Node 22.

### Phase 3: Benchmarks + documentation (AC-3, AC-4)

- [ ] **T3.1** Implement
      `packages/core/tests/benchmark/storage-bench-fixture.ts` (seedable PRNG
      for 100 commit-like + 50 issue-like notes + L2-normalized vectors).
- [ ] **T3.2** Implement
      `packages/core/tests/benchmark/db-size-bench.test.ts`. Asserts
      `after / before <= 0.625` (16 → 10 MB equivalent). Used as a regression
      guard; AC-1 primary evidence is the manual ingest in Gate B.
- [ ] **T3.3** Implement
      `packages/core/tests/benchmark/quantization-recall-bench.test.ts`. 1000
      vectors, 100 queries, mean Jaccard@10 ≥ 0.95. Runtime budget < 60 s.
- [ ] **T3.4** (optional) Implement
      `packages/core/tests/benchmark/quantization-recall-real-bench.test.ts`
      using a small fixed set of real ONNX embeddings (skipped when the
      model is unavailable).
- [ ] **T3.5** Author `docs/benchmarks/db-storage-v2.md` with all required
      fields (sample repos + commit SHAs, host info, Node version, package
      versions, model name, timestamp, baseline / after / reduction, recall,
      reproduction commands). NO internal ticket IDs in the body — only the
      spec directory name `KNOW-404-db-storage-optimization` for traceability.
- [ ] **T3.6** Run `pnpm benchmark:longmemeval:quick` once; record the recall
      number into `docs/benchmarks/db-storage-v2.md`.

### Phase 4: Verification gates and PR

- [ ] **Gate A** Local full check (Node 20 + 22 verify, coverage ≥ 80 %,
      `pnpm audit --audit-level=moderate --prod`, `rg FLOAT[384]` clean,
      `rg KNOW-404` clean in user-facing docs).
- [ ] **Gate B** AC end-to-end manual: ingest `honojs/hono` and `encode/httpx`,
      check DB ≤ 10 MB, `status` output displays the breakdown, results land
      in `docs/benchmarks/db-storage-v2.md`.
- [ ] **Gate C** Draft PR (`gh pr create --draft --base develop`); rebase onto
      latest develop (resolve `## [Unreleased]` and README conflicts only by
      keeping both); `gh pr checks --watch` until all checks succeed; CI
      results recorded in PR description.
- [ ] **Gate D** `gh pr ready`; final `gh pr view | grep KNOW-404` returns no
      hits beyond the spec directory reference; review feedback handled via
      `/git-pr-fix`.

## Verification Checklist

- [ ] All AC in requirements.md verified by Phase 4 gates
- [ ] All tests pass: `pnpm test:run`
- [ ] Full verification: `pnpm verify` on Node 20 and Node 22
- [ ] Coverage ≥ 80 %
- [ ] `pnpm audit --audit-level=moderate --prod` clean
- [ ] No `FLOAT[384]` residue in `packages/core/src`
- [ ] No `KNOW-404` mentions in user-facing files (docs/, CHANGELOG.md,
      README.md, PR title/body) outside the spec directory reference
- [ ] No unrelated changes
- [ ] Conventional Commit messages used; per-package scope

## Notes

- Migration order is determined by the `version` field, not the filename
  prefix. Current max is **20**; this spec adds **21**.
- `--no-verify`, `git push --tags`, and force-pushing are forbidden by the
  project's CLAUDE memory.
- The concurrent KNOW-403 branch (`feat/know-403-cross-project-search`) was
  observed in the local repo at planning time; expected conflicts are
  README and CHANGELOG only.
