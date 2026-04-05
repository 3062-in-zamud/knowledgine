# Format Examples

Concrete examples of well-formatted knowledge captures.

---

## Example 1: Bug Fix (TypeScript)

**Title**: Fix "object is possibly undefined" in KnowledgeRepository.getById

**Tags**: `bug-fix`, `typescript`, `null-safety`

**Content**:

```
Problem: TypeScript error "object is possibly 'undefined'" when accessing note.id after
calling repository.getById(). The method signature returned Note | undefined but all
call sites assumed Note.

Root cause: The method was added when the codebase was less strict. The return type
correctly reflects that a record might not exist, but call sites were not updated.

Fix:
1. Updated all call sites to handle the undefined case explicitly:
   const note = repository.getById(id);
   if (!note) { throw new Error(`Note ${id} not found`); }
2. Added a getByIdOrThrow() helper for cases where undefined is a programming error.

Prevention: Avoid non-null assertions (!). Add repository methods with explicit error
semantics (OrThrow suffix) so callers choose their error handling strategy.
```

---

## Example 2: Design Decision (Architecture)

**Title**: Use append-only markers in CLAUDE.md for knowledgine rules section

**Tags**: `design-decision`, `architecture`

**Content**:

```
Decision: Wrap the injected rules section in HTML comment markers
<!-- knowledgine:rules:start --> and <!-- knowledgine:rules:end --> rather than
replacing the entire file or using a separate file.

Options considered:
A) Separate .knowledgine/RULES.md file — requires agent to know about the extra file
B) Replace entire CLAUDE.md — destroys user customizations on re-run
C) Append-only (no markers) — cannot update or remove without leaving duplicates
D) Marked section (chosen) — idempotent updates, preserves surrounding content

Chosen: Option D. The markers allow the CLI to find and replace exactly the
knowledgine section on subsequent runs while leaving user-written content intact.
This makes setup re-runnable and upgrade-safe.

Trade-off: If the user manually removes one marker, the update logic will break.
Documented in the README as a known limitation.
```

---

## Example 3: Troubleshooting (Native Module)

**Title**: sqlite-vec fails after Node.js major version upgrade — run npm rebuild

**Tags**: `troubleshooting`, `sqlite`, `native-modules`, `nodejs`

**Content**:

```
Symptom: "Error: The specified module could not be found" (Windows) or
"invalid ELF header" (Linux) when loading sqlite-vec after upgrading Node.js.

Root cause: Native addons (.node files) are compiled against a specific Node.js ABI
version (NODE_MODULE_VERSION). Upgrading Node.js changes the ABI, making pre-compiled
binaries incompatible.

Diagnosis steps:
1. Confirmed error occurs only after Node upgrade, not on fresh install
2. Checked node-gyp output: "gyp info using node@20.x.x | ABI 115"
3. Found existing .node file compiled for ABI 108 (Node 18)

Resolution: Run `npm rebuild` (or `pnpm rebuild`) after every Node.js major version
upgrade. This recompiles all native modules for the current ABI.

For CI: Pin NODE_MODULE_VERSION in cache keys to avoid stale compiled artifacts.
```

---

## Example 4: Pattern Discovery

**Title**: Pattern: early-return guard clauses to eliminate deep nesting

**Tags**: `pattern`, `refactoring`

**Content**:

```
Problem: Functions with multiple validation steps produce deeply nested if/else blocks
that are hard to read and test independently.

Pattern: Use guard clauses (early returns) to validate preconditions at the top of the
function, keeping the happy path at the minimum indent level.

Before:
  function processNote(note: Note | undefined) {
    if (note) {
      if (note.content) {
        if (note.content.length > 0) {
          // actual logic here — 3 levels deep
        }
      }
    }
  }

After:
  function processNote(note: Note | undefined) {
    if (!note) return;
    if (!note.content) return;
    if (note.content.length === 0) return;
    // actual logic here — top level
  }

Applies to: Any function with multiple nullable inputs or precondition checks.
Caveat: When early returns have side effects (logging, metrics), make that explicit.
```

---

## Example 5: External Knowledge

**Title**: ESM requires .js extension in TypeScript import paths even for .ts source files

**Tags**: `external-knowledge`, `esm`, `typescript`, `nodejs`

**Content**:

```
Source: https://www.typescriptlang.org/docs/handbook/esm-node.html

Insight: When compiling TypeScript to ESM (module: "NodeNext" or "ESNext" + type:
"module" in package.json), import paths MUST end in .js — not .ts — even when the
source file is .ts.

Reason: TypeScript does not rename import extensions at compile time. The runtime
(Node.js ESM loader) looks for .js files. TypeScript resolves .ts source files when
you write `import foo from "./foo.js"` — it knows that .js refers to the compiled .ts.

Applied to this project: All internal imports in packages/cli/src/ use .js extensions.
Forgetting this causes "Cannot find module" at runtime despite TypeScript compiling
successfully (because tsc resolves the type but Node.js cannot find the file).

Gotcha: `import type` paths also need .js extensions in strict ESM mode.
```
