## Release v**VERSION**

### Checklist

- [ ] Version bumped in all `package.json` files (`packages/core`, `cli`, `mcp-server`, `ingest`, root)
- [ ] `CHANGELOG.md` updated (`[Unreleased]` → `[vX.Y.Z] - YYYY-MM-DD`)
- [ ] `pnpm run verify` passes locally
- [ ] No breaking changes without MAJOR version bump
- [ ] All CI checks pass

### Changes since last release

<!-- Auto-generated or manually written summary of changes -->

### Release type

- [ ] **patch** — bug fixes, no API changes
- [ ] **minor** — new features, backward compatible
- [ ] **major** — breaking changes

### Post-merge

Merging this PR to `main` will automatically:

1. Create git tag `vX.Y.Z`
2. Publish all packages to npm
3. Create a GitHub Release with auto-generated notes
