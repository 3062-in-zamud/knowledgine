---
name: sdd-init
description: >
  Initialize a new SDD spec directory with templates. Creates specs/KNOW-{NNN}-{description}/
  with requirements.md, design.md, and tasks.md populated from templates. Auto-assigns the
  next available ticket number.
---

# sdd-init

## Purpose

Create a new spec directory for a feature, following the SDD naming convention and populating
it with template files. This is the entry point to the SDD workflow.

## When to Use

- Starting work on a **new feature** that needs a spec
- Beginning a **significant refactor** that should be documented
- Planning an **architectural change** that affects multiple packages

## When NOT to Use

- Bug fixes, typo corrections, small refactors (no spec needed)
- A spec already exists for the feature (use `/sdd-spec` to refine it)

## Step-by-Step Instructions

1. **Read `specs/README.md`** to get the next available KNOW number from the "Next Available Number" section

2. **Ask the user** (if not provided as argument):
   - Short title for the feature (will become directory name in kebab-case)
   - One-line summary of what the feature does

3. **Create the spec directory**:

   ```
   specs/KNOW-{NNN}-{kebab-case-title}/
   ```

4. **Copy and populate templates** from `specs/_templates/`:
   - `requirements.template.md` → `requirements.md` (replace `{TITLE}` and `{NNN}`)
   - `design.template.md` → `design.md` (replace `{TITLE}` and `{NNN}`)
   - `tasks.template.md` → `tasks.md` (replace `{TITLE}` and `{NNN}`)

5. **Update `specs/README.md`**:
   - Increment the "Next Available Number"
   - Add an entry to the "Spec Index" table with status `draft`

6. **Report to the user**:
   - Spec directory path
   - Suggest next step: `/sdd-spec KNOW-{NNN}` to write the spec content

## Arguments

- `$ARGUMENTS` (optional): Feature title. If not provided, ask the user.

## Example

User: `/sdd-init push-based capture`

Result:

```
Created: specs/KNOW-001-push-based-capture/
  ├── requirements.md (template)
  ├── design.md (template)
  └── tasks.md (template)

Updated: specs/README.md (index + next number)

Next step: /sdd-spec KNOW-001
```

## Reference Files

- `specs/README.md` — Naming conventions, next available number
- `specs/_templates/` — Template files to copy
- `docs/workflows/sdd-overview.md` — Full SDD workflow context
