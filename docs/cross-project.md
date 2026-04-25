# Cross-Project Knowledge

knowledgine can read, transfer, and reference notes across multiple
project databases at once. This document explains how to register
projects, control which projects are visible to whom, and move notes
between them.

> Status: this guide is being expanded alongside the cross-project
> transfer / link work. The CLI and MCP surfaces below are stable; the
> visibility and transfer sections are filled out as those features
> land.

## Quick reference

| Surface             | Command / Tool                                        | Notes                                                       |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| CLI search          | `knowledgine search <query> --projects a,b`           | Names from `.knowledginerc` or absolute / `~/` / `./` paths |
| MCP search          | `search_knowledge` with `projects: ["a","b"]`         | Registered project names only via MCP                       |
| CLI transfer (copy) | `knowledgine transfer --from a --to b --note-id <id>` | Copies note + embeddings + patterns + intra-note links      |
| CLI link            | `knowledgine link --source a --note-id <id> --into b` | Stub note in target; resolves source on demand              |
| CLI resolve         | `knowledgine show --resolve-link <stub-id>`           | Fetches source body; prints `[broken link]` if unreachable  |

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

Detailed guides on visibility behavior, transfer semantics, and the
broken-link UX are written when those features ship.
