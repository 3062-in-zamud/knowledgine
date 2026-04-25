# Requirements: Cross-Project Knowledge Transfer

## Ticket ID

KNOW-338

## Status

draft

## Problem Statement

The cross-project surface in knowledgine is currently **read-only**. After
KNOW-403 / KNOW-404, the CLI (`knowledgine search --projects ...`) and the
MCP `search_knowledge` tool both accept a list of projects and use a leak-safe
`CrossProjectSearcher` to query several local SQLite databases at once. But
once a useful note is found in project A there is no way to bring it into
project B's index — no copy, no reference, no visibility rules to control
which projects are exposed to a given caller. The cross-project loop never
closes.

This spec adds the missing write half so users can:

1. **Copy** a note (with its embeddings, patterns, and intra-note links) from
   one project into another.
2. **Link** a note from one project so it appears in another project's index
   as a lightweight stub that resolves the original on demand.
3. **Restrict visibility** so private projects are not exposed to unauthorized
   callers, and audit-friendly bypasses exist for local debugging.

The same connection helper that serves search will also serve transfer/link,
so the read and write paths cannot drift in their leak handling or version
floors.

## Acceptance Criteria

Each criterion below is testable. Failure of any AC blocks PR creation per
the verification gate in `tasks.md`.

- [ ] **AC-1 (Concurrent SQLite safety)**: Opening N project databases (where
      `N ≤ MAX_CONNECTIONS = 10`) for read or write must release every
      database connection on both happy and error paths. Verified by
      `packages/core/tests/storage/project-db.test.ts` covering: read-only
      open, version-floor enforcement per mode (`readSource ≥ 8` /
      `writeCopy ≥ 21` / `writeLink ≥ 22`), missing-path skip, RW open
      against a freshly-migrated DB, and `..` traversal rejection. The
      existing 8 cases in `cross-project-searcher.test.ts` continue to pass
      (no behavior regression, including `console.warn` wording).

- [ ] **AC-2 (Cross-project search via CLI and MCP)**: `knowledgine search
    --projects a,b` and the MCP `search_knowledge` tool with
      `projects: ["a","b"]` both return merged results from the listed
      projects, sorted by FTS5 score descending, with `crossProject: true`
      on the MCP envelope. Verified by an extended
      `cross-project-searcher.test.ts` plus a new
      `packages/mcp-server/tests/cross-project-search.test.ts`. Both paths
      apply the visibility filter (AC-4) before constructing the searcher.

- [ ] **AC-3 (Knowledge transfer — copy and link)**:
  - **copy**: `knowledgine transfer --from <p> --to <q> --note-id <id>`
    moves the note plus `extracted_patterns`, `note_embeddings` (float32
    BLOB **and** `note_embeddings_vec` INT8 mirror via
    `KnowledgeRepository.saveEmbedding`), `note_links` whose other end
    was also copied in this run, and `problem_solution_pairs` between
    copied patterns. The target row's `frontmatter_json` carries
    `transferred_from = { project: <selfName>, sourceNoteId,
transferredAt }` (no absolute path). On `file_path` UNIQUE collision
    in target, the entire transaction rolls back with the message
    `note with file_path "X" already exists in target (note id Y);
use --rename or remove duplicate first`. Verified by
    `note-transfer-service.test.ts`.

  - **link**: `knowledgine link --source <p> --note-id <id> --into <q>`
    inserts a link stub note in target (`title = [link] <source title>`,
    empty content, `frontmatter_json.linked_from = { project: <selfName>,
sourceNoteId, sourcePath }`) and a `cross_project_links` row.
    `knowledgine show --path <q> --resolve-link <stub-id>` resolves the
    stub via `NoteLinkService.resolveLink`, returning one of three
    statuses: `ok` (with up-to-date source content), `source_missing`
    (project path unreachable or DB unopenable), or `note_deleted`
    (project reachable but the source note is gone). Broken links
    display `[broken link: <reason>]`. Verified by
    `note-link-service.test.ts` and `migration022.test.ts`.

  - **idempotency**: copy is **not** idempotent (each call assigns a new
    target id); link is unique on `(local_note_id, source_project_path,
source_note_id)` and rejects duplicates.

- [ ] **AC-4 (Access control — project visibility)**: A project marked
      `visibility: private` in `.knowledginerc` is excluded from
      cross-project search and transfer source-resolution unless the caller's
      `selfName` is listed in the project's `allowFrom: [...]`. The caller
      `selfName` comes from the **top-level `selfName` key** in the rc file
      that loads when the CLI/MCP server starts. With no `selfName`, the
      caller is `null` and may read only `public` projects. Setting the env
      var `KNOWLEDGINE_ALLOW_PRIVATE=1` bypasses the gate but emits one
      `[KNOWLEDGINE_ALLOW_PRIVATE] private project access bypass active`
      stderr warning per call. Verified by `visibility-gate.test.ts`
      (public-default, private-skip, allowFrom-allow, env-bypass + stderr
      assertion, missing-`selfName` warning, empty `allowFrom: []` blocks
      everyone) and an extended `cross-project-searcher.test.ts` case that
      pins the **filter-then-slice** ordering (visibility runs before the
      `MAX_CONNECTIONS` cap so visible projects are not crowded out).

- [ ] **AC-5 (CI green on Node 20 and 22)**: `pnpm verify` passes locally on
      both Node 20 and Node 22. The GitHub Actions matrix on the resulting
      PR is fully green. `pnpm audit --audit-level=moderate --prod` reports
      no new high/critical advisory relative to `develop`.

## Constraints

- **Performance**:
  - `openProjectDb` must impose no more overhead than the inlined logic it
    replaces (≤ 1 ms per call).
  - `transferNote` runs in a single SQLite transaction; for a note with
    50 patterns and 20 embeddings the wall-clock target is < 200 ms on the
    AC reference dataset.
  - `resolveLink` opens the source DB read-only and reads exactly one
    `knowledge_notes` row.

- **Compatibility**:
  - Migration 22 is **forward-only**; `down()` is a no-op.
  - Migration 22 is **idempotent** (`CREATE TABLE IF NOT EXISTS`); rerunning
    on a migrated DB is a no-op.
  - Source DBs at `schema_version ≥ 8` remain readable by `transferNote`
    and `resolveLink`. Targets need at least version 21 for copy and 22
    for link; the failure message tells the user to run
    `knowledgine migrate --path <target>`.
  - The `RcConfig` schema retains its existing `passthrough()` policy so
    older rc files that lack `selfName`, `visibility`, or `allowFrom` keep
    working with safe defaults (caller=null, public-only).

- **Security**:
  - `transferred_from` and `linked_from` carry the source project's
    `selfName` only — never an absolute path. (Paths are stored in
    `cross_project_links.source_project_path` because `resolveLink` needs
    them, but they never leak into target frontmatter.)
  - All path arguments to `transfer` and `link` go through
    `resolveProjectArgs` (which calls `path.resolve()`); `openProjectDb`
    additionally rejects paths whose normalized form contains `..` segments
    that escape the user-provided base.
  - The bypass env var must always print to stderr — silent bypasses are a
    bug.

## Affected Packages

- [x] `@knowledgine/core` (storage, access, transfer, migrations)
- [x] `@knowledgine/cli` (`transfer`, `link`, `show --resolve-link`,
      `search --projects` rewiring)
- [x] `@knowledgine/mcp-server` (`search_knowledge` visibility wiring +
      cross-project test)
- [ ] `@knowledgine/ingest`
- [ ] `@knowledgine/mcp-memory-protocol`

## Out of Scope

Listed explicitly to prevent scope creep.

- Pro/Enterprise license gating of the transfer feature. The feature itself
  ships as OSS; gating will be a separate billing-layer PR.
- Cross-project copy/link of `entities`, `relations`, `observations`, or
  `events`. The graph stays project-local.
- Real-time bidirectional sync between projects. `link` is a one-way
  on-demand resolution.
- Automatic deduplication or `--rename` flow when target already has a
  note with the same `file_path`. Today such a copy fails fast.
- Note-level (tag-based) visibility (e.g. `tags: [private]`). Visibility
  is project-level only.
- New MCP `transfer_note` / `link_note` tools. CLI is the consent surface.
- Bulk transfer (`--note-ids 1,2,3`, `--from-search '<query>'`). Single-note
  per call only; bulk is a follow-up.
- Automatic GC of orphan link stubs after the source note is deleted.
  Future `knowledgine gc` command will handle this.

## Prior Art / References

- Plan: `/Users/ren0826nosuke/.claude/plans/know-338-partitioned-dahl.md`
- Predecessor — KNOW-403 cross-project search path resolution
  (`specs/KNOW-403-cross-project-search-path/`, PR #79, merged
  `a27e32b6`): introduced `resolveProjectArgs` (`~/`, `./`, `../`,
  absolute paths, registered names) and the `CrossProjectSearcher` /
  CLI `--projects` plumbing reused here.
- Predecessor — KNOW-404 DB storage optimization
  (`specs/KNOW-404-db-storage-optimization/`, PR #81, merged
  `a4468121`): introduced migration 21 (INT8 quantization with float32
  BLOB rerank) which sets the `writeCopy` floor at schema_version 21.
- Existing core pieces reused: `CrossProjectSearcher`
  (`packages/core/src/search/cross-project-searcher.ts`),
  `KnowledgeRepository.saveEmbedding`
  (`packages/core/src/storage/knowledge-repository.ts`),
  `loadRcFile` (`packages/core/src/config/config-loader.ts`),
  `ALL_MIGRATIONS` (`packages/core/src/index.ts`).
