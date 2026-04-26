# Cross-Project Knowledge

knowledgine can read, transfer, and reference notes across multiple
project databases at once. This document covers the full surface:
how to register projects, how visibility works, how to copy or link
notes between them, and how the CLI and MCP layers expose each piece.

## Quick reference

| Surface             | Command / Tool                                        | Notes                                                       |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| CLI search          | `knowledgine search <query> --projects a,b`           | Names from `.knowledginerc` or absolute / `~/` / `./` paths |
| MCP search          | `search_knowledge` with `projects: ["a","b"]`         | Registered project names only via MCP                       |
| CLI transfer (copy) | `knowledgine transfer --from a --to b --note-id <id>` | Copies note + embeddings + patterns                         |
| CLI link            | `knowledgine link --source a --note-id <id> --into b` | Stub note in target; resolves source on demand              |
| CLI resolve         | `knowledgine show-link <stub-id> --path <target>`     | Fetches source body; prints `[broken link]` if unreachable  |

## `.knowledginerc` example

```yaml
selfName: webapp
projects:
  - name: client-a
    path: ~/work/client-a
    visibility: private
    allowFrom: [webapp]
  - name: scratch
    path: ~/scratch
    # visibility omitted → public
```

JSON form (`.knowledginerc.json`) is identical in shape.

### Fields

- `selfName` (top level, optional) — caller identity used by the
  visibility gate. If omitted, the caller is anonymous and may read
  only `public` projects.
- `projects[].name`, `projects[].path` — registry entries; the path
  must contain a `.knowledgine/index.sqlite` file.
- `projects[].visibility` — `"private"` or `"public"` (default
  `"public"`).
- `projects[].allowFrom` — array of caller `selfName` values that may
  read this project when it is private. An empty array `[]` blocks
  every caller.

## Visibility rules

| Project visibility | Caller `selfName` in `allowFrom`? | Result                                   |
| ------------------ | --------------------------------- | ---------------------------------------- |
| `public` (default) | n/a                               | always visible                           |
| `private`          | yes                               | visible (read + transfer-from permitted) |
| `private`          | no                                | hidden                                   |
| `private`          | caller is `null` (no `selfName`)  | hidden                                   |

The gate is enforced **before** the `MAX_CONNECTIONS = 10` cap so that
hidden projects do not crowd visible ones out of the cap.

### Bypass for local debugging

`KNOWLEDGINE_ALLOW_PRIVATE=1` lets every project through regardless of
visibility. The bypass writes a stderr warning on **every** call so it
is never silent.

## Transfer (copy)

```
knowledgine transfer \
  --from <project>     # registered name OR path
  --to   <project>
  --note-id <id>       # source note id
  [--dry-run]          # report what would happen, do not write
  [--format json|plain]
  [--path <dir>]       # caller selfName comes from this dir's rc
```

Behavior:

- Reads the source project read-only and the target read-write.
- Wraps the copy in a single SQLite transaction. On any failure the
  target is left exactly as it was.
- Copies `knowledge_notes`, `extracted_patterns`,
  `note_embeddings` (float32 BLOB **and** the `note_embeddings_vec`
  INT8 mirror — both written through `KnowledgeRepository.saveEmbedding`
  so they cannot drift).
- Adds `transferred_from = { project: <selfName>, sourceNoteId,
transferredAt }` to the target note's `frontmatter_json`. Absolute
  paths are never written to frontmatter.
- **Not idempotent.** Two consecutive transfers of the same note allocate
  two different target ids.
- `note_links` and `problem_solution_pairs` whose other end is not in
  this run are dropped with a warning (single-note transfer cannot
  preserve cross-references whose other endpoint stays in the source).
- A `file_path` UNIQUE collision in the target rolls the whole
  transaction back with a remediation message.

The target schema must be at version 21 or above. Older targets get a
clear "run `knowledgine migrate --path <target>`" error.

## Link (lazy reference)

```
knowledgine link \
  --source <project>
  --note-id <id>
  --into   <project>
  [--format json|plain]
  [--path <dir>]
```

Inserts a stub note in the target (`title = "[link] <source title>"`,
body is a marker, `frontmatter_json.linked_from` carries the source
project name + path + note id) and a row in `cross_project_links`. The
real body is fetched on demand by `show-link`.

The target schema must be at version 22 or above (the
`cross_project_links` table is added by migration 022).

## Resolve a link stub

```
knowledgine show-link <stub-id> [--path <target>] [--format json|plain]
```

Resolves the link via `NoteLinkService.resolveLink`, returning one of
three statuses:

| Status           | Meaning                                                    |
| ---------------- | ---------------------------------------------------------- |
| `ok`             | source project reachable, source note found, body returned |
| `source_missing` | source project path unreachable or its DB cannot be opened |
| `note_deleted`   | source project reachable but the linked note id is gone    |

Plain output renders `[broken link: <reason>]` for the failure cases.
JSON output preserves the discriminated `result.status` field for
programmatic consumers.

## What does NOT cross projects

The following are intentionally project-local (out of scope for KNOW-338):

- Knowledge graph entities, relations, observations, and events.
- Memory entries.
- Real-time bidirectional sync.
- Note-level (tag-based) visibility.
- Bulk transfer (`--note-ids 1,2,3`); single-note per call only.
- Automatic GC of orphan link stubs after the source note is deleted.

## End-to-end smoke test

`scripts/e2e-cross-project.sh` exercises every command above against
two temporary projects in `$TMPDIR`. Run it from the monorepo root
(after a `pnpm build`) to validate the full stack on your machine. CI
does not run it — its job is to be a fast manual reproduction tool.
