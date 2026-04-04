# Phase 4: Release

**Lead tool**: Claude Code
**Input**: Approved and merged PR
**Output**: Updated spec status, knowledge captured, release (if applicable)

## Closing a Spec

After PR is merged to `develop`:

```
/sdd-close KNOW-XXX
```

This:

1. Verifies all acceptance criteria in `requirements.md` are met
2. Updates spec status from `in-progress` to `completed`
3. Records the release version (if released)
4. Captures design decisions and learnings via `knowledgine-capture`
5. Updates the spec index in `specs/README.md`

## Release Process

When ready to cut a release (may include multiple completed specs):

```
/release
```

This triggers the existing `git-release` skill:

1. Push `develop` to remote
2. Generate release summary from commits
3. Propose version bump (major/minor/patch)
4. Update `package.json` files
5. Generate `CHANGELOG.md` entry
6. Create release PR: `develop` → `main`
7. After merge, CI automatically:
   - Creates git tag
   - Publishes to npm
   - Creates GitHub Release

## Post-Release

After release:

- Verify npm packages are published correctly
- Check `specs/README.md` — all released specs should show `completed`
- Use `/sdd-status` to confirm no orphaned specs

## Branching Reminder

```
feature branches → develop (merge PR here)
                     ↓ release PR
                   main (triggers npm publish)
```

Never merge feature branches directly to `main`.
