---
name: sdd-sync
description: >
  Synchronize specs/tasks.md with Plans.md. Expands spec tasks into Plans.md format with
  spec reference links, and reflects Plans.md completions back to tasks.md. Bridges SDD
  and Harness workflows.
---

# sdd-sync

## Purpose

Bridge the SDD workflow (specs/) with the Harness workflow (Plans.md). Ensures both systems
stay in sync without manual duplication.

## When to Use

- After creating a new spec (to populate Plans.md)
- After completing tasks in Plans.md (to update tasks.md)
- At the start of a session to sync any drift

## Arguments

- `$ARGUMENTS` (optional): Spec ID (e.g., `KNOW-001`). If omitted, sync all active specs.

## Step-by-Step Instructions

### Spec → Plans.md (Forward Sync)

1. Read `specs/KNOW-{NNN}-*/tasks.md`
2. For each unchecked task, generate a Plans.md entry:

```markdown
### KNOW-001: Push-based capture

Spec: specs/KNOW-001-push-based-capture/

- [ ] Write tests for CaptureListener interface (see design.md §Architecture)
- [ ] Implement CaptureListener (see design.md §Interface Definitions)
- [ ] Write integration tests (see requirements.md AC-1 through AC-3)
```

3. Write or update the corresponding section in Plans.md
4. Preserve any existing Plans.md content that isn't spec-related

### Plans.md → Spec (Reverse Sync)

1. Read Plans.md for completed tasks that reference a spec
2. Find the corresponding task in `specs/KNOW-{NNN}-*/tasks.md`
3. Check off the matching task in tasks.md
4. Report any tasks completed in Plans.md but not in tasks.md (drift)

### Drift Detection

Compare both directions and report discrepancies:

```markdown
## Sync Report: KNOW-001

### Forward (tasks.md → Plans.md)

- 3 tasks added to Plans.md
- 0 tasks already present

### Reverse (Plans.md → tasks.md)

- 2 completions synced to tasks.md
- 0 drift detected

### Warnings

- (none)
```

## Reference Files

- `docs/workflows/sdd-overview.md` — How SDD and Harness relate
- Plans.md — Current task tracking (managed by Harness)
