---
name: git-commit
description: |
  Create Conventional Commits with type prefix, breaking change detection, dry-run preview,
  and strict rules against ticket IDs in messages. **AUTOMATICALLY USE** when:
  (1) Creating git commits ("commit", "git commit")
  (2) Suggesting commit messages ("commit message")
  (3) Splitting commits ("split commits")
  (4) Fixing commit messages ("fix commit")
  (5) Any git commit related request
---

# Git Commit

Create clean, meaningful commits following Conventional Commits.

## Core Rules

**Format**: `<type>: <description>`

```
feat: add hybrid search fallback to keyword mode

Gracefully degrade to keyword search when embedding
provider is unavailable, with user-facing warning.

BREAKING CHANGE: searchMode option "auto" removed, use "hybrid" instead
```

**Strict prohibitions:**

- NEVER include ticket numbers, issue IDs, or internal references in the subject line
  - Bad: `feat: add search KNOW-305`
  - Bad: `fix: resolve #123 crash`
  - OK in footer only: `Closes #123`
- NEVER include scope in parentheses — use `feat:` not `feat(cli):`
- No trailing period in description
- No capitalized first letter in description

**Description rules:**

- Imperative mood ("add" not "added", "fix" not "fixes")
- Lowercase start
- Max 72 characters
- One commit = one logical change

## Type Reference

| Type       | When to use                              | Semver impact |
| ---------- | ---------------------------------------- | ------------- |
| `feat`     | New feature or capability                | minor         |
| `fix`      | Bug fix                                  | patch         |
| `docs`     | Documentation only                       | patch         |
| `style`    | Formatting, whitespace (no logic change) | patch         |
| `refactor` | Code change that neither fixes nor adds  | patch         |
| `perf`     | Performance improvement                  | patch         |
| `test`     | Add or update tests                      | patch         |
| `chore`    | Maintenance, deps, tooling               | patch         |
| `ci`       | CI/CD configuration                      | patch         |
| `build`    | Build system changes                     | patch         |
| `revert`   | Revert a previous commit                 | patch         |

**Breaking changes** (`!` suffix or `BREAKING CHANGE:` footer) → **major**

## Breaking Change Detection

Before committing, scan staged changes for these patterns. If detected, use `feat!:` or `fix!:` prefix and add `BREAKING CHANGE:` footer.

**Triggers:**

- Exported function/type signature changes (parameters added/removed/reordered)
- `exports` field changes in package.json
- Database migration with DROP/RENAME on existing columns
- CLI command renamed or removed
- Configuration file format incompatibility
- Public API return type changes

**Detection approach:**

1. Run `git diff --staged` and look for changes to exported symbols
2. Check if any `package.json` `exports` fields changed
3. Check for migration files with destructive operations
4. If breaking change found → prompt user to confirm `!` suffix

See [[references/breaking-change-patterns]] for detailed patterns and grep commands.

## Workflow

### Step 1: Analyze changes

```bash
git status          # overview
git diff --staged   # what will be committed
git diff            # unstaged changes (warn if present)
```

If nothing is staged, warn the user and suggest what to stage.

### Step 2: Determine type

- Analyze the diff content to select the appropriate type
- If changes span multiple logical concerns → recommend splitting into separate commits
- Show reasoning: "This adds a new function → `feat`" or "This fixes a null check → `fix`"

### Step 3: Preview (always)

Display the proposed commit before executing:

```
Proposed commit:
────────────────
feat: add hybrid search fallback to keyword mode

Gracefully degrade to keyword search when embedding
provider is unavailable, with user-facing warning.

Co-Authored-By: Codex <noreply@anthropic.com>
────────────────
Type: feat (new capability)
Breaking: No
Files: 3 changed
```

If breaking changes detected, show warning prominently.

### Step 4: Commit

After user confirms the preview:

```bash
git commit -m "$(cat <<'EOF'
feat: add hybrid search fallback to keyword mode

Gracefully degrade to keyword search when embedding
provider is unavailable, with user-facing warning.

Co-Authored-By: Codex <noreply@anthropic.com>
EOF
)"
```

Use HEREDOC format to preserve multi-line messages.

## Commit Splitting

When changes contain multiple logical units:

1. Identify distinct concerns (e.g., feature + test + docs)
2. Use `git add -p` or specific file paths to stage incrementally
3. Create separate commits for each concern
4. Order: infrastructure → implementation → tests → docs

**Split when:**

- Feature code + unrelated refactor
- Bug fix + new test for different feature
- Multiple independent features in one diff

**Keep together when:**

- Feature + its tests
- Bug fix + regression test for that bug
- Rename across files (single logical change)

## Verification Checklist

Before finalizing any commit:

- [ ] No ticket numbers or issue IDs in subject line
- [ ] No scope in parentheses
- [ ] Type correctly reflects the change
- [ ] Description is imperative, lowercase, no period, ≤72 chars
- [ ] Breaking changes marked with `!` and `BREAKING CHANGE:` footer
- [ ] One logical change per commit
- [ ] Unstaged changes warned about (if any)

## References

- [[references/breaking-change-patterns]] — Detection patterns for TypeScript/Node.js
- [[references/examples]] — Commit message examples for common scenarios
