# Capture Guide

Detailed guidance for each of the six capture trigger types.

---

## 1. Bug Fix

**When**: You diagnosed and resolved a defect.

**What to include**:

- Exact error message or symptom
- Root cause (not just "it was broken")
- The fix applied
- How to avoid the bug in future

**Example**:

```
Problem: "Cannot read properties of undefined (reading 'id')" at user.ts:42.

Root cause: getUser() returned undefined when the database row did not exist, but the
caller assumed a non-null return value.

Fix: Added null check in getUser() and updated the return type to User | undefined.
Updated all callers to handle the undefined case.

Prevention: Avoid non-null assertions (!). Return undefined explicitly and propagate the
type to callers.
```

Tags: `bug-fix`, `typescript`, `null-safety`

---

## 2. Design Decision

**When**: You chose one architectural or implementation approach over alternatives.

**What to include**:

- The decision made (concise summary in the title)
- Options that were considered
- The chosen approach
- Reasoning and trade-offs
- Any constraints that drove the decision

**Example**:

```
Decision: Use Zod for runtime API response validation instead of manual type guards.

Options considered:
A) Manual type guards — verbose, error-prone to maintain
B) Zod schema validation — declarative, generates TypeScript types automatically
C) io-ts — functional style, steep learning curve for the team

Chosen: Zod (option B). The automatic type inference reduces duplication between
runtime validation and TypeScript types. Team is already familiar with Zod from
form validation.
```

Tags: `design-decision`, `typescript`, `validation`

---

## 3. Pattern Discovery

**When**: You identified a reusable code pattern applicable beyond the current file.

**What to include**:

- Pattern name (if it has one)
- Problem the pattern solves
- Template/skeleton code
- Where to apply it
- Caveats or limitations

**Example**:

```
Pattern: Repository layer with in-memory cache for read-heavy entities.

When to use: Entity reads are >10x more frequent than writes and data fits in memory.

Template:
  class CachedRepository<T> {
    private cache = new Map<string, T>();
    find(id: string): T | undefined { return this.cache.get(id); }
    store(id: string, entity: T): void { this.cache.set(id, entity); }
    invalidate(id: string): void { this.cache.delete(id); }
  }

Caveat: Cache must be invalidated on writes; not suitable for distributed deployments
without a shared cache layer.
```

Tags: `pattern`, `caching`, `architecture`

---

## 4. Troubleshooting

**When**: You worked through a multi-step diagnostic process to resolve an issue.

**What to include**:

- Initial symptom
- Hypotheses tested and results
- False leads (so others don't repeat them)
- Final diagnosis
- Resolution steps

**Example**:

```
Symptom: knowledgine start fails with "SQLITE_ERROR: no such module: vec0" after
upgrading Node.js from 18 to 20.

Hypotheses tested:
- Reinstalled sqlite-vec package — no change
- Cleared node_modules and reinstalled — no change
- Downgraded back to Node 18 — resolved the issue

Diagnosis: Native module compiled for Node 18 ABI. Node 20 uses a different ABI
(NODE_MODULE_VERSION 115 vs 108).

Resolution: Run "npm rebuild" after upgrading Node.js to recompile native modules.
```

Tags: `troubleshooting`, `sqlite`, `native-modules`, `nodejs`

---

## 5. External Knowledge

**When**: You applied insights from documentation, articles, blog posts, or Stack Overflow.

**What to include**:

- Source URL or reference
- Key insight extracted
- How you applied it to this project
- Any caveats specific to this codebase

**Example**:

```
Source: https://nodejs.org/api/esm.html#esm_mandatory_file_extensions

Insight: In ESM (type: "module" in package.json), import paths MUST include the .js
extension even for TypeScript files. The TypeScript compiler emits .js extensions in
output but the source .ts files must reference .js for tsc to resolve them correctly.

Applied: Updated all internal imports in packages/cli/src to use .js extension.
```

Tags: `external-knowledge`, `esm`, `typescript`

---

## 6. Refactoring

**When**: You improved the structure or quality of existing code.

**What to include**:

- What was wrong before
- What you changed
- The improvement achieved (readability, performance, maintainability)
- Any risks or trade-offs

**Example**:

```
Before: Single 400-line setupCommand() function with nested conditionals handling all
target types inline.

After: Extracted per-target config builders into a TARGET_HANDLERS map. Each handler
is a pure function returning McpConfig. The main command orchestrates selection and
writing only.

Improvement: Adding a new target now requires only adding one entry to TARGET_HANDLERS
rather than editing the main function. Test coverage became straightforward.
```

Tags: `refactoring`, `architecture`
