# Tasks: Cross-Project Knowledge Transfer

## Ticket ID

KNOW-338

## Prerequisites

- [x] Spec reviewed (requirements.md + design.md drafted)
- [x] Feature branch created: `feat/know-338-cross-project-knowledge-transfer`
- [x] Worktree at `.worktrees/know-338-cross-project-knowledge-transfer`
- [x] `pnpm install --frozen-lockfile` (Node 22) green
- [ ] `grep -rn "frontmatter_json LIKE" packages/` recorded — confirm
      `transferred_from` / `linked_from` keys do not collide with any
      existing pattern (Phase 0 follow-up)

## Implementation Tasks

Each task follows TDD: failing test first, minimal implementation, then
refactor. Mark complete only when the listed verification passes.

### Phase 1: Connection abstraction (AC-1)

- [ ] **Task 1.1**: Inventory `console.warn` wording in
      `packages/core/src/search/cross-project-searcher.ts` and the
      assertions in `packages/core/tests/search/cross-project-searcher.test.ts`.
- [ ] **Task 1.2**: Write `packages/core/tests/storage/project-db.test.ts`
      covering all three modes, missing path, traversal rejection, RW
      open success.
- [ ] **Task 1.3**: Implement `packages/core/src/storage/project-db.ts`
      with `openProjectDb` and `PROJECT_DB_FLOORS`.
- [ ] **Task 1.4**: Replace lines 31–58 of `cross-project-searcher.ts`
      with a call to `openProjectDb(p, { mode: "readSource" })`,
      preserving warn wording.
- [ ] **Task 1.5**: `pnpm --filter @knowledgine/core test:run` green
      (project-db + cross-project-searcher).

### Phase 2: MCP cross-project test + visibility wiring stub (AC-2)

- [ ] **Task 2.1**: Write `packages/mcp-server/tests/cross-project-search.test.ts`
      covering the `projects: [...]` branch returning `{ crossProject:
true }`. (Visibility cases come back in Phase 3.)
- [ ] **Task 2.2**: Wire a placeholder filter in MCP cross-project
      branch (returns identity until Phase 3 lands the real gate).
- [ ] **Task 2.3**: `pnpm --filter @knowledgine/mcp-server test:run` green.
- [ ] **Task 2.4**: Decide the docs path for the cross-project section
      (proposal: a single new file `docs/cross-project.md` since neither
      `docs/cli.md` nor `docs/mcp.md` exists). Stub the file with
      placeholders; full content comes in Phase 5.

### Phase 3: Visibility (AC-4)

- [ ] **Task 3.1**: Extend `RcConfig` Zod schema in `config-loader.ts`:
      top-level `selfName?: string`; `projects[].visibility?` and
      `projects[].allowFrom?`. Confirm `passthrough()` is preserved.
- [ ] **Task 3.2**: Write `packages/core/tests/access/visibility-gate.test.ts`
      with all 6 scenarios (public default, private skip, allowFrom
      allow, env bypass + stderr, missing selfName, empty `allowFrom:
[]`).
- [ ] **Task 3.3**: Implement `packages/core/src/access/visibility-gate.ts`.
- [ ] **Task 3.4**: Replace placeholder in MCP server with the real
      `filterReadableProjects`.
- [ ] **Task 3.5**: Apply `filterReadableProjects` in
      `packages/cli/src/commands/search.ts` **before** constructing
      `CrossProjectSearcher` (filter-then-slice ordering).
- [ ] **Task 3.6**: Extend `cross-project-searcher.test.ts` with the
      filter-then-slice ordering test.
- [ ] **Task 3.7**: `pnpm --filter @knowledgine/core --filter @knowledgine/mcp-server --filter @knowledgine/cli test:run` green.

### Phase 4a: vec0 spike + copy transfer (AC-3 part 1)

- [ ] **Task 4a.0** (**spike, mandatory**): create a temporary DB,
      insert 100 rows in `note_embeddings_vec`, run `BEGIN; INSERT 50
more; ROLLBACK;`, assert row count returns to 100. Record date,
      result, and chosen implementation strategy in `design.md`
      §"Decision 5".
- [ ] **Task 4a.1**: Write `packages/core/tests/transfer/note-transfer-service.test.ts`
      covering happy path, UNIQUE collision rollback, missing source,
      vec absent target, 2-pass orphan handling, no-idempotency,
      `transferred_from` payload.
- [ ] **Task 4a.2**: Implement
      `packages/core/src/transfer/note-transfer-service.ts` per
      design.md (2 passes inside one transaction, `saveEmbedding`
      reused).
- [ ] **Task 4a.3**: Add `packages/cli/src/commands/transfer.ts` and
      register it in `packages/cli/src/index.ts`. Confirm `--help`
      contains no `KNOW-` token.
- [ ] **Task 4a.4**: Write `packages/cli/tests/commands/transfer.test.ts`.
- [ ] **Task 4a.5**: `pnpm --filter @knowledgine/core --filter @knowledgine/cli test:run` green.

### Phase 4b: migration 22 + link service + show --resolve-link (AC-3 part 2)

- [ ] **Task 4b.1**: Write `packages/core/tests/storage/migrations/migration022.test.ts`
      (idempotent rerun, forward-only, index existence).
- [ ] **Task 4b.2**: Implement
      `packages/core/src/storage/migrations/migration022_cross_project_links.ts`.
- [ ] **Task 4b.3**: Append `migration022` to `ALL_MIGRATIONS` in
      `packages/core/src/index.ts`. Update the `CLAUDE.md` "Current max"
      note alongside.
- [ ] **Task 4b.4**: Write `packages/core/tests/transfer/note-link-service.test.ts`
      covering happy link, 3 resolve statuses, metadata recording,
      UNIQUE collision.
- [ ] **Task 4b.5**: Implement
      `packages/core/src/transfer/note-link-service.ts`.
- [ ] **Task 4b.6**: Add `packages/cli/src/commands/link.ts` (and
      register). Add `--resolve-link <stub-id>` to the existing `show`
      command. Confirm both `--help` outputs contain no `KNOW-` token.
- [ ] **Task 4b.7**: Write `packages/cli/tests/commands/link.test.ts`.
- [ ] **Task 4b.8**: `pnpm --filter @knowledgine/core --filter @knowledgine/cli test:run` green.

### Phase 5: Polish + verification gates + PR (AC-5)

- [ ] **Task 5.1**: Fill `docs/cross-project.md` with command reference,
      `.knowledginerc` example, broken-link UX, and the visibility
      ladder. No internal ticket id appears in the doc body.
- [ ] **Task 5.2**: Update `README.md` (or `README.ja.md`) with one
      line and a link to `docs/cross-project.md`. Update `CHANGELOG.md`
      `## [Unreleased]`.
- [ ] **Task 5.3**: Commit `scripts/e2e-cross-project.sh`. Run it
      locally; confirm `ALL E2E PASSED`.
- [ ] **Task 5.4** — **Gate A**: `volta run --node 22 pnpm lint
&& pnpm format:check && pnpm typecheck` green.
- [ ] **Task 5.5** — **Gate B**: `volta run --node 22 pnpm test:run`
      green (full repo).
- [ ] **Task 5.6** — **Gate C**: `volta run --node 22 pnpm
test:coverage` and confirm line coverage ≥ 80 % on
      `packages/core/src/{transfer,access,storage/project-db.ts}`.
- [ ] **Task 5.7** — **Gate D**: `volta run --node 20 pnpm verify` green
      and `volta run --node 22 pnpm verify` green and `pnpm audit
--audit-level=moderate --prod` shows no new high/critical relative
      to develop.
- [ ] **Task 5.8**: Open Draft PR — `gh pr create --draft --base develop`
      with title `feat(core): cross-project knowledge transfer
(transfer/link)` (no `KNOW-` in title). PR body must include AC
      satisfaction map (one bullet per AC referencing the proving test
      file), the spike result, and the Out-of-Scope list.
- [ ] **Task 5.9**: `gh pr checks --watch` green for both Node matrices.
      On failure, `gh run view --log-failed`, fix, push (no
      `--no-verify`).
- [ ] **Task 5.10**: Address review comments. After all approve,
      `gh pr ready` to mark Ready for review.

## Verification Checklist

Run before requesting a human review.

- [ ] All five acceptance criteria in `requirements.md` are covered by
      the listed tests and the manual E2E script
- [ ] `volta run --node 20 pnpm verify` and `volta run --node 22 pnpm
verify` both green locally
- [ ] `gh pr checks --watch` reports green for the matrix
- [ ] `scripts/e2e-cross-project.sh` printed `ALL E2E PASSED` on the
      author's machine
- [ ] No internal ticket id appears in any user-facing string
      (`grep -rn "KNOW-" packages/cli/src packages/mcp-server/src docs/`
      → only spec dir paths)
- [ ] Migration 22 is the last entry in `ALL_MIGRATIONS` in
      `packages/core/src/index.ts`; `CLAUDE.md` "Current max" updated
- [ ] Conventional Commit messages used; scope is package name
- [ ] No unrelated changes (lockfile diffs are scrutinized)

## Notes

- vec0 spike result must be filled in design.md §"Decision 5" before
  Phase 4a.1 begins. If the spike shows mirror writes survive ROLLBACK,
  switch to post-commit `ensureVectorIndexTable` reconstruction and
  amend the data-flow description in design.md "Transfer (copy)".
- If Phase 4b is more than 50 % over budget after 24 h, cut `link` from
  this PR and ship copy-only; track link in a follow-up ticket. Document
  the split in PR description.
- The CLAUDE.md "Current max: 20" comment (incorrect — migration 21
  exists) gets corrected to 22 in Phase 4b.3 alongside the registration.
