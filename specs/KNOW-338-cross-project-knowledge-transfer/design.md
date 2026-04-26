# Design: Cross-Project Knowledge Transfer

## Ticket ID

KNOW-338

## Architecture Overview

```
                .knowledginerc (extended: selfName, projects[].visibility, projects[].allowFrom)
                              |
                              v
  CLI search/transfer/link  -+-> VisibilityGate (new, core/access)
  MCP search_knowledge      -+         |
                                       v
                       openProjectDb(..., mode) (new, core/storage)
                          ├─ CrossProjectSearcher  (existing — internal call replaced)
                          ├─ NoteTransferService   (new, core/transfer — saveEmbedding reused)
                          └─ NoteLinkService       (new, core/transfer — resolveLink built-in)
                                       |
                                       v
                          per-project SQLite (RO/RW, version floor branched by mode)
```

New files:

- `packages/core/src/storage/project-db.ts` — `openProjectDb(...)` and floors.
- `packages/core/src/access/visibility-gate.ts` — single source of truth
  for read/transfer permission.
- `packages/core/src/transfer/note-transfer-service.ts` — copy.
- `packages/core/src/transfer/note-link-service.ts` — link + resolveLink.
- `packages/core/src/storage/migrations/migration022_cross_project_links.ts`.
- `packages/cli/src/commands/transfer.ts`.
- `packages/cli/src/commands/link.ts`.
- `scripts/e2e-cross-project.sh` (committed; not run by CI).
- Test files: see Testing Strategy.

Modified files:

- `packages/core/src/search/cross-project-searcher.ts` — its inline open
  - version-check block (lines 31–58 in current state) is replaced by a
    call to `openProjectDb(..., { mode: "readSource" })`. Wording of the
    four `console.warn` calls must be preserved (existing tests assert on
    them).
- `packages/core/src/config/config-loader.ts` — Zod `RcConfig` schema
  picks up `selfName`, `projects[].visibility`, `projects[].allowFrom`.
  `passthrough()` is preserved so older rc files keep loading.
- `packages/core/src/index.ts` — `migration022` is appended to the
  `ALL_MIGRATIONS` array.
- `packages/cli/src/commands/search.ts` — applies `filterReadableProjects`
  before constructing `CrossProjectSearcher`.
- `packages/mcp-server/src/server.ts` — same filter in the cross-project
  branch (lines 67–73 in current state).
- `packages/cli/src/commands/show.ts` (or equivalent) — adds
  `--resolve-link <stub-id>` flag delegating to `NoteLinkService.resolveLink`.

## Interface Definitions

```typescript
// packages/core/src/storage/project-db.ts

export type ProjectDbMode = "readSource" | "writeCopy" | "writeLink";

export interface ProjectDbHandle {
  db: import("better-sqlite3").Database;
  schemaVersion: number;
  path: string;
}

export interface OpenProjectDbOptions {
  mode: ProjectDbMode;
  // when true (writeCopy/writeLink default), throw on floor failure
  // when false (readSource default), warn + return null
}

export const PROJECT_DB_FLOORS: Record<ProjectDbMode, number> = {
  readSource: 8,
  writeCopy: 21,
  writeLink: 22,
};

export function openProjectDb(
  project: { name: string; path: string },
  opts: OpenProjectDbOptions,
): ProjectDbHandle | null;
```

```typescript
// packages/core/src/access/visibility-gate.ts

export interface ProjectEntry {
  name: string;
  path: string;
  visibility?: "private" | "public";
  allowFrom?: string[];
}

export function filterReadableProjects(
  callerSelfName: string | null,
  projects: ProjectEntry[],
): ProjectEntry[];

export function canTransferFrom(callerSelfName: string | null, source: ProjectEntry): boolean;

export const ALLOW_PRIVATE_ENV_VAR = "KNOWLEDGINE_ALLOW_PRIVATE";
```

```typescript
// packages/core/src/transfer/note-transfer-service.ts

export interface TransferOptions {
  dryRun?: boolean;
}

export interface TransferResult {
  sourceNoteId: number;
  targetNoteId: number;
  copiedTables: string[]; // e.g. ["knowledge_notes", "extracted_patterns", ...]
  skipped: string[]; // e.g. ["note_embeddings_vec (target has no vec table)"]
  warnings: string[]; // e.g. ["dropped note_link to absent note_id=42"]
}

export class NoteTransferService {
  constructor(opts: { callerSelfName: string | null });
  transferNote(input: {
    sourceProject: ProjectEntry;
    targetProject: ProjectEntry;
    sourceNoteId: number;
    options?: TransferOptions;
  }): Promise<TransferResult>;
}
```

```typescript
// packages/core/src/transfer/note-link-service.ts

export interface LinkResult {
  sourceNoteId: number;
  targetNoteId: number; // id of the link stub note in target
  linkRowId: number; // id in cross_project_links
}

export type ResolveResult =
  | { status: "ok"; sourceNote: NoteRow; lastResolvedAt: string }
  | { status: "source_missing"; reason: "project_path_unreachable" | "db_unopenable" }
  | { status: "note_deleted"; sourceProjectPath: string };

export class NoteLinkService {
  constructor(opts: { callerSelfName: string | null });
  linkNote(input: {
    sourceProject: ProjectEntry;
    targetProject: ProjectEntry;
    sourceNoteId: number;
  }): Promise<LinkResult>;
  resolveLink(targetProject: ProjectEntry, linkStubNoteId: number): Promise<ResolveResult>;
}
```

```typescript
// packages/core/src/config/config-loader.ts (extension)

export interface RcConfig {
  // existing fields ...
  selfName?: string; // NEW: caller identity
  projects?: Array<{
    name: string;
    path: string;
    visibility?: "private" | "public"; // NEW: default "public"
    allowFrom?: string[]; // NEW: caller selfNames allowed
  }>;
  // [key: string]: unknown; passthrough preserved
}
```

## Data Flow

### Cross-project search (extended)

1. CLI/MCP receives caller `selfName` from the active rc file.
2. The list of registered projects (from `RcConfig.projects[]`) is passed
   through `filterReadableProjects(callerSelfName, projects)` **before**
   `CrossProjectSearcher` is constructed. This ensures the
   `MAX_CONNECTIONS = 10` slice does not waste slots on projects the
   caller cannot read.
3. The searcher calls `openProjectDb(p, { mode: "readSource" })` per
   project; on null (missing path or version < 8) it warns and continues.
4. Results are collected, sorted by score descending, sliced to `limit`,
   and returned (CLI prints them; MCP wraps them in
   `{ crossProject: true, results }`).

### Transfer (copy)

1. CLI receives `--from`, `--to`, `--note-id`. `resolveProjectArgs`
   resolves both names/paths.
2. `canTransferFrom(callerSelfName, sourceProject)` is checked first; if
   false, exit 1 with `transfer denied: source project is private and
allowFrom does not include caller`.
3. `openProjectDb(sourceProject, { mode: "readSource" })` for read.
4. `openProjectDb(targetProject, { mode: "writeCopy" })` for RW; on
   floor failure, throws and CLI exits with `target requires
schema_version ≥ 21; run 'knowledgine migrate --path <target>' first`.
5. Begin a single SQLite transaction on target.
6. **Pass 1 (insert)**: insert `knowledge_notes` (new id; frontmatter
   carries `transferred_from = { project: callerSelfName, sourceNoteId,
transferredAt }`); insert `extracted_patterns` (new ids, mapped from
   source note id → new note id); call
   `KnowledgeRepository.saveEmbedding(newNoteId, float32BLOB)` which
   writes both `note_embeddings.embedding` and `note_embeddings_vec`
   atomically with `vec_int8(?)`. Build `oldId → newId` map for both
   notes and patterns.
7. **Pass 2 (relink)**: for each `note_links` row whose other end is
   present in the note id map, insert a new edge with mapped ids; for
   any other end absent, push a warning string and drop. Same for
   `problem_solution_pairs` over the pattern id map.
8. Commit. On exception, the transaction rolls back automatically; the
   target is left exactly as it was before the call. Return
   `TransferResult { copiedTables, skipped, warnings }`.

### Link

1. CLI receives `--source`, `--note-id`, `--into`.
2. Visibility gate as above (`canTransferFrom`).
3. `openProjectDb(source, { mode: "readSource" })` to read the title
   (only the title is fetched; the body remains in source).
4. `openProjectDb(target, { mode: "writeLink" })`; floor failure tells
   the user to run migration on target.
5. Insert the link stub note in target:
   - `title = "[link] " + sourceTitle`
   - `content = ""` (empty — the body is fetched on resolve)
   - `frontmatter_json.linked_from = { project: callerSelfName,
sourceNoteId, sourcePath: sourceProject.path }`
6. Insert a `cross_project_links` row with `(local_note_id =
stubTargetId, source_project_name = sourceProject.name,
source_project_path = sourceProject.path, source_note_id, link_type
= "reference", metadata_json = JSON.stringify({ sourceTitle, linkedAt
}))`.
7. Return `LinkResult`.

### Resolve link

1. `NoteLinkService.resolveLink(targetProject, linkStubNoteId)` opens the
   target RO, reads the matching `cross_project_links` row.
2. If the row's `source_project_path` does not exist on disk →
   `{ status: "source_missing", reason: "project_path_unreachable" }`,
   record `metadata_json.lastError = { reason, observedAt }`.
3. Otherwise `openProjectDb({ name: source_project_name, path:
source_project_path }, { mode: "readSource" })`. If null →
   `{ status: "source_missing", reason: "db_unopenable" }`.
4. `SELECT * FROM knowledge_notes WHERE id = ?`. If no row →
   `{ status: "note_deleted", sourceProjectPath }`.
5. Otherwise update `metadata_json.lastResolvedAt` and return
   `{ status: "ok", sourceNote, lastResolvedAt }`.

`knowledgine show --resolve-link <stub-id>` formats the result with
`[broken link: <reason>]` for the failure cases.

## Key Design Decisions

### Decision 1: Connection helper — single `openProjectDb` with mode-branched floor

- **Chosen**: A small module with one function and three modes
  (`readSource ≥ 8`, `writeCopy ≥ 21`, `writeLink ≥ 22`). The existing
  `CrossProjectSearcher` switches to it; transfer/link use it directly.
- **Alternatives considered**: A `CrossProjectConnectionManager` class
  that owns a pool; a per-call inline open as before.
- **Rationale**: Two callers (searcher + transfer) is not enough to
  justify a manager class. Branching the floor by mode in one place is
  the cheapest way to satisfy AC-1 and the "target requires migration N"
  error path that the BLOCKER review demanded.

### Decision 2: Caller identity from a top-level `selfName` key, not `projects[]` self-reference

- **Chosen**: Add `selfName?: string` at the top level of the rc file.
- **Alternatives considered**: Have callers list themselves in
  `projects[]` and use the matching entry; pull caller name from cwd
  basename.
- **Rationale**: Listing one's own project in `projects[]` is not a
  convention anywhere in the codebase; assuming so would leave nearly
  every real installation with `caller = null` and effectively unable
  to access private projects. Cwd basename collides with directory
  rename. A dedicated key is unambiguous, optional, and easy to
  generate from `knowledgine init`. Missing-key behavior is a single
  warning + `caller = null` (public-only access).

### Decision 3: Copy reuses `KnowledgeRepository.saveEmbedding`, never raw INSERT

- **Chosen**: `note_embeddings.embedding` and `note_embeddings_vec`
  must be written together by `saveEmbedding`, not by a hand-rolled
  INSERT pair.
- **Alternatives considered**: Direct INSERT of float32 BLOB and INT8
  mirror separately for speed.
- **Rationale**: `saveEmbedding` is the existing canonical writer; it
  computes the INT8 mirror via `vec_int8(?)` exactly the same way that
  `migration021` and `ensureVectorIndexTable` do. Bypassing it has
  twice produced subtle mirror skew during KNOW-404 development. The
  cost is one extra function call per row; the safety is total.

### Decision 4: 2-pass copy (notes/patterns first, then links)

- **Chosen**: Pass 1 inserts every note/pattern/embedding and builds an
  `oldId → newId` map; pass 2 walks `note_links` and
  `problem_solution_pairs` and rewrites edges through the map.
- **Alternatives considered**: A single linear pass that inserts edges
  inline as it encounters them.
- **Rationale**: Edges can reference notes that have not yet been
  inserted in a single linear pass, leading to dropped edges that
  should have been kept. The 2-pass design keeps the transaction small
  enough to fit the AC-3 latency target and removes the entire class
  of "edge dropped because we hadn't gotten there yet" bugs.

### Decision 5: vec0 transaction behavior — spike first, decide design

- **Chosen**: At Phase 4 start, run a 100-row copy spike with `BEGIN ...
ROLLBACK` and check whether `note_embeddings_vec` row count returns
  to its pre-BEGIN value. Record the result (and the chosen handling)
  in this design document before writing `NoteTransferService`.
- **Alternatives considered**: Assume vec0 honors transactions (the
  default if we did nothing).
- **Rationale**: vec0 is a virtual table; sqlite-vec's transaction
  semantics are documented as "best-effort" and have surprised us
  before (KNOW-404 hotfix). If the spike shows mirror writes survive
  ROLLBACK, the design switches to **post-commit mirror reconstruction
  via `KnowledgeRepository.ensureVectorIndexTable`** so partial
  failures cannot leave a half-populated mirror.

  **Spike result** (verified by
  `packages/core/tests/storage/vec0-rollback-spike.test.ts`):

  ```
  Date: 2026-04-26
  Setup: fully migrated DB (incl. migration 021 INT8 mirror), 100 notes
         pre-loaded, then BEGIN; 50 more notes + saveEmbedding; ROLLBACK
  Observation: notes=100/100, vec=100/100 → vec0 HONORS ROLLBACK
  Implementation choice: in-transaction (single db.transaction() wraps
                          both knowledge_notes AND note_embeddings_vec
                          writes; partial failure rolls both back)
  ```

  The spike test is committed as a regression pin: if the assertion ever
  flips (sqlite-vec changes its semantics), the test will fail and force
  us to revisit the design.

### Decision 6: link is one-way and may break

- **Chosen**: `resolveLink` returns one of three statuses
  (`ok` / `source_missing` / `note_deleted`); CLI/UI shows `[broken
link]` for failures. Orphan link cleanup is out of scope.
- **Alternatives considered**: Auto-delete stub on first failed
  resolve; sync source updates back into target.
- **Rationale**: Auto-delete on a transient outage (e.g. an external
  drive is unmounted) would silently destroy user data. Two-way sync
  is a different feature class. A future `knowledgine gc` command can
  curate stubs with persistently failing resolves.

### Decision 7: No `transfer_note` / `link_note` MCP tool

- **Chosen**: MCP exposes only the read path (`search_knowledge` with
  visibility filter). All writes go through CLI.
- **Alternatives considered**: Mirror the CLI commands as MCP tools.
- **Rationale**: Cross-project mutation is destructive and crosses
  trust boundaries. Keeping it on the CLI gives the user an explicit
  consent surface that an autonomous agent cannot bypass without human
  shell access. The MCP description picks up one extra sentence
  (`Private projects are excluded unless caller is in their allowFrom`)
  to make the visibility behavior visible to agent callers.

## Migration Strategy

Migration 22: `cross_project_links` (forward-only, idempotent).

```sql
CREATE TABLE IF NOT EXISTS cross_project_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_note_id INTEGER NOT NULL,
  source_project_name TEXT,
  source_project_path TEXT NOT NULL,
  source_note_id INTEGER NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'reference',
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (local_note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE,
  UNIQUE(local_note_id, source_project_path, source_note_id)
);
CREATE INDEX IF NOT EXISTS idx_cross_project_links_source
  ON cross_project_links(source_project_path);
```

Registered in `ALL_MIGRATIONS` (appended at the end of the array). The
`Migrator` sorts by `version`, so the file order in the source array
does not matter — the appended `version: 22` becomes the last to run.
The existing version gaps (017/018 are skipped) confirm version-based
ordering is the only correct ordering.

`down()` is empty: dropping `cross_project_links` would orphan stub
notes whose only purpose is being targets of those rows.

`note_embeddings_vec` is unchanged from migration 21.

## Security Considerations

- **Path traversal**: `resolveProjectArgs` calls `path.resolve()` and
  rejects non-existent paths. `openProjectDb` adds a second guard:
  before opening, it asserts the resolved DB path is inside the
  resolved project root (i.e. `dbPath.startsWith(projectRoot + sep)`).
  A `..` segment that escapes the user-provided base is rejected with a
  clear error.
- **Information disclosure**: target's `frontmatter_json` (which is
  searchable, exportable, and printable) carries `transferred_from`
  and `linked_from` containing only the source's `selfName`. Absolute
  paths exist only in `cross_project_links.source_project_path` —
  internal DB column not surfaced by `search` or any export.
- **Auth bypass auditability**: `KNOWLEDGINE_ALLOW_PRIVATE=1` triggers a
  stderr warning **on every visibility check**, not once per process.
  This is by design — the ALLOW_PRIVATE flag is a debugging convenience
  and should be loud.
- **Concurrent open caps**: `MAX_CONNECTIONS = 10` is preserved. The
  visibility filter runs first so the cap is not consumed by projects
  the caller cannot see.
- **No new dependencies**: this spec adds no third-party packages.

## Testing Strategy

Unit tests:

- `packages/core/tests/storage/project-db.test.ts` — mode-branched floor,
  null on missing path, RW open, traversal rejection.
- `packages/core/tests/access/visibility-gate.test.ts` — public default,
  private skip, allowFrom allow, env-var bypass + stderr assertion,
  missing-`selfName` warning, empty `allowFrom: []` blocks all.
- `packages/core/tests/transfer/note-transfer-service.test.ts` — happy
  path (6 tables), `saveEmbedding`-mediated mirror, UNIQUE collision +
  rollback, missing source, vec table absent in target with `console.warn`
  spy, 2-pass orphan-edge handling, no-idempotency (twin transfer
  produces distinct ids), `transferred_from.project` carries `selfName`
  only.
- `packages/core/tests/transfer/note-link-service.test.ts` — happy link,
  three resolve statuses (ok / source_missing / note_deleted),
  metadata `lastResolvedAt` / `lastError` recording, UNIQUE collision.
- `packages/core/tests/storage/migrations/migration022.test.ts` —
  idempotent rerun, forward-only, index created.

Integration tests:

- `packages/core/tests/search/cross-project-searcher.test.ts` — extend
  with visibility filter scenarios + filter-then-slice ordering. The
  pre-existing 8 cases must keep passing with byte-exact `console.warn`
  wording.
- `packages/mcp-server/tests/cross-project-search.test.ts` — `projects`
  parameter enters cross-project branch; visibility filter excludes a
  private project; `crossProject: true` in the response envelope.
- `packages/cli/tests/commands/transfer.test.ts` — argument parsing,
  `--dry-run`, `--format json|plain`, cwd switch (temp dir) for
  relative/absolute/`~`, no internal ticket id in `--help`.
- `packages/cli/tests/commands/link.test.ts` — same plus `show
--resolve-link` round trip.

Edge cases captured by tests:

- Source DB at version 7 (refused with `readSource` floor).
- Target DB at version 21 trying to receive a `link` (refused with the
  remediation message).
- Target DB at version 20 trying to receive a `copy` (refused).
- `transferred_from` JSON does not collide with any existing
  `frontmatter_json LIKE '%...%'` query (Phase 0 adds a grep step that
  is asserted in code review).
- `..` traversal in `--from` path.
- `KNOWLEDGINE_ALLOW_PRIVATE=1` set across the entire test run vs. only
  one call.
- Source project deleted between `link` and `resolve-link`.

E2E (manual, scripted): `scripts/e2e-cross-project.sh` exercises every
AC against `/tmp/proj-a` and `/tmp/proj-b`. CI does not run it (avoids
flaky tmp-dir issues); the script is committed for human reproduction
and is required to print `ALL E2E PASSED` before the PR moves out of
draft.

## Dependencies

- New runtime dependencies: **none**.
- Modified packages: see `requirements.md` Affected Packages.
- Migration 22 must be appended to `ALL_MIGRATIONS` in
  `packages/core/src/index.ts`.
