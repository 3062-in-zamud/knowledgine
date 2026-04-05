# Semver Bump Decision Rules

## Core Rules

| Condition                               | Bump  | Example                    |
| --------------------------------------- | ----- | -------------------------- |
| `BREAKING CHANGE:` footer or `!` suffix | major | `feat!: remove legacy API` |
| Any `feat:` commit                      | minor | `feat: add search command` |
| Only `fix:`, `docs:`, `refactor:`, etc. | patch | `fix: handle null config`  |

**Highest wins**: If commits include both `feat:` and `fix:`, bump is minor (not patch).

## Pre-1.0 Convention

For versions `0.x.y`:

- Breaking changes bump **minor** (0.2.3 → 0.3.0), not major
- This is standard semver: "Major version zero is for initial development. Anything MAY change."
- Always ask user to confirm: offer both minor bump and 1.0.0 as options
- New features bump **minor** as usual
- Fixes bump **patch** as usual

## Decision Flow

```
1. Any BREAKING CHANGE or ! suffix?
   ├── Yes + version >= 1.0.0 → MAJOR
   ├── Yes + version < 1.0.0 → Ask: minor or jump to 1.0.0?
   └── No → continue

2. Any feat: commits?
   ├── Yes → MINOR
   └── No → continue

3. Any other commits (fix, docs, refactor, etc.)?
   ├── Yes → PATCH
   └── No → nothing to release
```

## Version Calculation

```
Current: X.Y.Z

MAJOR → (X+1).0.0
MINOR → X.(Y+1).0
PATCH → X.Y.(Z+1)
```

## Validation

After proposing a version:

- Verify it's greater than current version
- Verify it's greater than latest git tag
- Verify it follows semver (no leading zeros, valid format)
- If user provides custom version, validate same rules
