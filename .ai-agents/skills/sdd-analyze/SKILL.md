---
name: sdd-analyze
description: >
  Analyze existing codebase to inform spec design. Scans specified packages or directories
  to extract architecture patterns, public APIs, dependency relationships, and test coverage.
  Output feeds directly into design.md.
---

# sdd-analyze

## Purpose

Provide the technical context needed to write accurate `design.md` files. Instead of guessing
about existing patterns, this skill surveys the actual codebase.

## When to Use

- Before writing `design.md` for a new spec
- When unsure how a feature fits into the existing architecture
- To understand dependencies and impact of proposed changes

## Arguments

- `$ARGUMENTS`: Package name(s) or directory path(s) to analyze
  - Examples: `core`, `cli mcp-server`, `packages/core/src/search/`

## Step-by-Step Instructions

1. **Identify target packages/directories** from arguments or from `requirements.md` Affected Packages

2. **Scan architecture**:
   - Read main entry points (`src/index.ts`)
   - Identify exported types, interfaces, classes
   - Map the module dependency graph within the package
   - Note design patterns used (factory, strategy, plugin, etc.)

3. **Extract public APIs**:
   - List all exported functions, classes, interfaces with their signatures
   - Note which are used by other packages (cross-package dependencies)

4. **Check test coverage**:
   - Run `pnpm test:coverage` for the target package if practical
   - Or scan `tests/` directory to understand what's tested
   - Identify gaps in coverage

5. **Check for related knowledge**:
   - Use `knowledgine-recall` to find past decisions about these areas
   - Note any gotchas or patterns from past work

6. **Output a structured report**:

```markdown
## Analysis: {package/directory}

### Architecture Pattern

{description of patterns found}

### Public API Surface

| Export | Type | Used by |
| ------ | ---- | ------- |
| ...    | ...  | ...     |

### Internal Dependencies

{module dependency graph}

### Test Coverage

{current coverage for affected areas}

### Related Knowledge

{past decisions, gotchas from knowledgine-recall}

### Recommendations for Design

{suggestions for how new feature should integrate}
```

## Reference Files

- Package entry points: `packages/*/src/index.ts`
- Build config: `packages/*/tsconfig.build.json`
- Test directories: `packages/*/tests/`
