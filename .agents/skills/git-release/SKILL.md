---
name: git-release
description: |
  Orchestrate the full release process: push to develop, generate release summary,
  propose version bump, update package.json files, generate CHANGELOG, create release PR,
  and monitor CI. Supports dry-run preview mode. **AUTOMATICALLY USE** when:
  (1) Releasing a new version ("release", "cut a release", "prepare release")
  (2) Bumping version ("version bump", "bump version")
  (3) Creating release PRs ("release PR")
  (4) Generating changelogs ("changelog", "release notes")
  (5) Any release-related request
---

# Git Release

Orchestrate the full release process from develop to main.

## Prerequisites

Before starting, verify:

- Clean working tree (`git status` shows no changes)
- On `develop` branch
- `gh` CLI authenticated
- `pnpm` available

## Release Workflow

### Phase 1: Preparation

**Step 1: Validate state**

```bash
git status                    # must be clean
git branch --show-current     # must be "develop"
git fetch origin
git status -uno               # check sync with remote
```

If working tree is dirty, warn user and stop. If not on develop, warn and stop.

**Step 2: Push latest**

```bash
git push origin develop
```

Only if there are unpushed commits. Skip if already up to date.

**Step 3: Show changes since last release**

```bash
# Get last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# Show commit log
if [ -n "$LAST_TAG" ]; then
  git log ${LAST_TAG}..HEAD --oneline --no-merges
else
  git log --oneline --no-merges
fi
```

Display the full commit list and ask user to confirm these are the changes to release.

### Phase 2: Version Decision

**Step 4: Analyze commits**

Scan all commits since last tag and categorize:

| Commit prefix                    | Bump level | CHANGELOG section             |
| -------------------------------- | ---------- | ----------------------------- |
| `feat`                           | minor      | Added                         |
| `fix`                            | patch      | Fixed                         |
| `docs`                           | patch      | Added > Documentation         |
| `refactor`                       | patch      | Changed                       |
| `perf`                           | patch      | Changed                       |
| `test`                           | patch      | (omit from CHANGELOG)         |
| `chore`                          | patch      | (omit unless noteworthy)      |
| `ci`                             | patch      | Added > Infrastructure        |
| `build`                          | patch      | Added > Infrastructure        |
| `!` suffix or `BREAKING CHANGE:` | **major**  | (prefix section with warning) |

The highest bump level wins:

- Any breaking change → major
- Any `feat` → at least minor
- Only fixes/docs/chore → patch

**Step 5: Propose version**

Display:

```
Current version: 0.2.3
Proposed version: 0.3.0 (minor — new features detected)

Commits analyzed:
  feat: 3 (→ minor)
  fix: 2 (→ patch)
  docs: 1
  chore: 1

Accept proposed version? (or enter custom version)
```

Wait for user approval. User can override with any valid semver.

### Phase 3: Changes

**Step 6: Bump versions**

Update all 5 package.json files to the new version:

```bash
bash .Codex/skills/git-release/scripts/bump-versions.sh X.Y.Z
```

Files updated:

- `package.json` (root)
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/ingest/package.json`
- `packages/mcp-server/package.json`

Verify all files have matching version after bump.

**Step 7: Generate CHANGELOG entry**

Update `CHANGELOG.md`:

1. Read current content
2. If `[Unreleased]` has manual content, preserve it and merge with auto-generated entries
3. Create new version section from commits:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

#### CLI (`@knowledgine/cli`)

- Description from feat commit

#### Core (`@knowledgine/core`)

- Description from feat commit

#### Documentation

- Description from docs commit

#### Infrastructure

- Description from ci/build commit

### Changed

- Description from refactor/perf commit

### Fixed

- Description from fix commit
```

4. Reset `[Unreleased]` section to empty
5. Keep existing version entries unchanged

**Categorize by package**: Use file paths from each commit to determine package:

- `packages/cli/**` → CLI (`@knowledgine/cli`)
- `packages/core/**` → Core (`@knowledgine/core`)
- `packages/ingest/**` → Ingest (`@knowledgine/ingest`)
- `packages/mcp-server/**` → MCP Server (`@knowledgine/mcp-server`)
- `docs/**` or `*.md` → Documentation
- `.github/**`, config files → Infrastructure
- Multiple packages → list under each affected package

See [[references/changelog-format]] for detailed format specification.

**Step 8: Commit and push**

```bash
git add package.json packages/*/package.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
chore: bump version to X.Y.Z and update CHANGELOG

Co-Authored-By: Codex <noreply@anthropic.com>
EOF
)"
git push origin develop
```

### Phase 4: PR & CI

**Step 9: Create release PR**

```bash
gh pr create --base main --head develop \
  --title "Release vX.Y.Z" \
  --body "$(cat <<'EOF'
## Release vX.Y.Z

### Checklist

- [x] Version bumped in all `package.json` files
- [x] `CHANGELOG.md` updated
- [x] `pnpm run verify` passes locally
- [ ] All CI checks pass

### Changes since last release

<auto-generated summary from commits>

### Release type

- [ ] **patch** — bug fixes, no API changes
- [x] **minor** — new features, backward compatible
- [ ] **major** — breaking changes

### Post-merge

Merging this PR to `main` will automatically:

1. Create git tag `vX.Y.Z`
2. Publish all packages to npm
3. Create a GitHub Release with auto-generated notes
EOF
)"
```

Check the appropriate release type box. Fill in the changes summary.

**Step 10: Monitor CI**

```bash
# Get PR number
PR_NUMBER=$(gh pr view --json number -q .number)

# Watch CI checks
gh pr checks $PR_NUMBER --watch
```

Report results to user:

- **All green**: "All CI checks passed. PR is ready to merge."
- **Failure**: Identify the failing job and report details:
  ```bash
  gh run list --branch develop --limit 5
  gh run view <RUN_ID> --log-failed
  ```
  Suggest fix if possible. After fix is pushed, CI will re-run automatically on the PR.

## Dry-Run Mode

When user says "dry-run", "preview", or "what would release look like":

1. Execute Phase 1 (validation + commit list) — read-only
2. Execute Phase 2 (version proposal) — read-only
3. Show CHANGELOG preview — what would be generated
4. **Do NOT** modify any files, push, or create PRs
5. Report: "Dry run complete. Run `/release` to execute."

## Edge Cases

**No tags exist (first release)**:

- Use all commits in history
- Propose version from package.json (or 0.1.0 if 0.0.0)

**No commits since last tag**:

- Report "No changes since last release (vX.Y.Z). Nothing to release."
- Stop execution

**[Unreleased] has manual content**:

- Preserve manual entries
- Add auto-generated entries that aren't already listed
- Let user review merged result before committing

**CI failure**:

- Report which job failed (build, typecheck, lint, test, etc.)
- Show failed log excerpt
- Do NOT auto-merge. Wait for fix.
- After fix pushed to develop, PR updates automatically

**Version already bumped**:

- Compare package.json version with latest git tag
- If package.json > latest tag, warn: "Version already bumped to X.Y.Z. Continue with this version?"
- Prevent accidental double-bump

**Breaking changes in pre-1.0**:

- For 0.x versions, breaking changes typically bump minor (0.2→0.3)
- Ask user to confirm: "Breaking change detected. Bump to 0.3.0 (minor, pre-1.0 convention) or 1.0.0 (major)?"

## References

- [[references/changelog-format]] — CHANGELOG generation specification
- [[references/version-bump-rules]] — Semver bump decision logic
- [[scripts/bump-versions.sh]] — Version bump script
