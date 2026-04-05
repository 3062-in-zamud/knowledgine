# Commit Message Examples

## Simple Feature

```
feat: add REST API server for HTTP-based integrations
```

## Feature with Body

```
feat: add hierarchical config file discovery

Walk up from the current directory to find .knowledginerc.json,
merging settings from each level. Closest file wins on conflicts.
```

## Bug Fix

```
fix: handle missing config file gracefully on first run
```

## Breaking Change

```
feat!: replace searchMode "auto" with "hybrid"

The "auto" search mode was ambiguous and caused confusion.
"hybrid" explicitly combines FTS and vector search.

BREAKING CHANGE: searchMode "auto" is no longer accepted.
Use "hybrid" for combined search, or "keyword"/"semantic" for single-mode.
```

## Refactoring

```
refactor: extract event writer into separate module
```

## Test Addition

```
test: add E2E tests for CLI setup command
```

## Documentation

```
docs: add multi-agent setup guides for supported tools
```

## Chore / Maintenance

```
chore: bump version to 0.2.3 and update CHANGELOG
```

## CI Change

```
ci: add Node 22 to test matrix and remove Node 18
```

## Performance

```
perf: use batch INSERT for knowledge note ingestion
```

## Multiple Changes (split into separate commits)

Instead of one big commit, split:

```
# Commit 1: the feature
feat: add cursor IDE session history plugin

# Commit 2: tests for the feature
test: add integration tests for cursor plugin

# Commit 3: unrelated fix found during development
fix: drop vec0 triggers when sqlite-vec is not loaded
```

## Revert

```
revert: revert "feat: add experimental vector cache"

This reverts commit abc1234. The cache caused memory leaks
under high concurrency.
```
