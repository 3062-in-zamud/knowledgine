export const REFERENCES: Record<string, string> = {
  "capture-guide.md": `# Capture Guide

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
\`\`\`
Problem: "Cannot read properties of undefined (reading 'id')" at user.ts:42.

Root cause: getUser() returned undefined when the database row did not exist, but the
caller assumed a non-null return value.

Fix: Added null check in getUser() and updated the return type to User | undefined.
Updated all callers to handle the undefined case.

Prevention: Avoid non-null assertions (!). Return undefined explicitly and propagate the
type to callers.
\`\`\`

Tags: \`bug-fix\`, \`typescript\`, \`null-safety\`

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
\`\`\`
Decision: Use Zod for runtime API response validation instead of manual type guards.

Options considered:
A) Manual type guards — verbose, error-prone to maintain
B) Zod schema validation — declarative, generates TypeScript types automatically
C) io-ts — functional style, steep learning curve for the team

Chosen: Zod (option B). The automatic type inference reduces duplication between
runtime validation and TypeScript types. Team is already familiar with Zod from
form validation.
\`\`\`

Tags: \`design-decision\`, \`typescript\`, \`validation\`

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
\`\`\`
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
\`\`\`

Tags: \`pattern\`, \`caching\`, \`architecture\`

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
\`\`\`
Symptom: knowledgine start fails with "SQLITE_ERROR: no such module: vec0" after
upgrading Node.js from 18 to 20.

Hypotheses tested:
- Reinstalled sqlite-vec package — no change
- Cleared node_modules and reinstalled — no change
- Downgraded back to Node 18 — resolved the issue

Diagnosis: Native module compiled for Node 18 ABI. Node 20 uses a different ABI
(NODE_MODULE_VERSION 115 vs 108).

Resolution: Run "npm rebuild" after upgrading Node.js to recompile native modules.
\`\`\`

Tags: \`troubleshooting\`, \`sqlite\`, \`native-modules\`, \`nodejs\`

---

## 5. External Knowledge

**When**: You applied insights from documentation, articles, blog posts, or Stack Overflow.

**What to include**:
- Source URL or reference
- Key insight extracted
- How you applied it to this project
- Any caveats specific to this codebase

**Example**:
\`\`\`
Source: https://nodejs.org/api/esm.html#esm_mandatory_file_extensions

Insight: In ESM (type: "module" in package.json), import paths MUST include the .js
extension even for TypeScript files. The TypeScript compiler emits .js extensions in
output but the source .ts files must reference .js for tsc to resolve them correctly.

Applied: Updated all internal imports in packages/cli/src to use .js extension.
\`\`\`

Tags: \`external-knowledge\`, \`esm\`, \`typescript\`

---

## 6. Refactoring

**When**: You improved the structure or quality of existing code.

**What to include**:
- What was wrong before
- What you changed
- The improvement achieved (readability, performance, maintainability)
- Any risks or trade-offs

**Example**:
\`\`\`
Before: Single 400-line setupCommand() function with nested conditionals handling all
target types inline.

After: Extracted per-target config builders into a TARGET_HANDLERS map. Each handler
is a pure function returning McpConfig. The main command orchestrates selection and
writing only.

Improvement: Adding a new target now requires only adding one entry to TARGET_HANDLERS
rather than editing the main function. Test coverage became straightforward.
\`\`\`

Tags: \`refactoring\`, \`architecture\`
`,

  "tag-taxonomy.md": `# Tag Taxonomy

Standard tags for knowledgine knowledge captures. Use 2–5 tags per capture.
Choose the most specific applicable tags; avoid generic tags like "code" or "misc".

---

## Primary Category Tags (choose one)

| Tag | Use for |
|-----|---------|
| \`bug-fix\` | Resolved defects with root cause analysis |
| \`design-decision\` | Architectural or implementation choices with reasoning |
| \`pattern\` | Reusable code or design patterns |
| \`troubleshooting\` | Multi-step diagnostic processes |
| \`external-knowledge\` | Insights from external sources (docs, articles, SO) |
| \`refactoring\` | Code quality improvements |

## Domain Tags (choose 0–3)

### Languages & Runtimes
| Tag | Use for |
|-----|---------|
| \`typescript\` | TypeScript-specific patterns, type system |
| \`javascript\` | JavaScript-specific patterns |
| \`nodejs\` | Node.js runtime, native modules, ESM |
| \`sql\` | SQL queries, schema design |
| \`bash\` | Shell scripts, CLI tools |

### Quality & Safety
| Tag | Use for |
|-----|---------|
| \`null-safety\` | Null/undefined handling, optional chaining |
| \`type-safety\` | TypeScript strict mode, type guards |
| \`error-handling\` | Error propagation, try/catch patterns |
| \`validation\` | Input validation, schema validation |
| \`security\` | Auth, injection prevention, secrets management |
| \`testing\` | Test patterns, test utilities, coverage |

### Architecture
| Tag | Use for |
|-----|---------|
| \`architecture\` | High-level structural decisions |
| \`api-design\` | REST, RPC, GraphQL interface design |
| \`database\` | Database schema, migrations, queries |
| \`caching\` | In-memory or distributed caching |
| \`async\` | Async/await patterns, concurrency |

### Infrastructure & Tooling
| Tag | Use for |
|-----|---------|
| \`build\` | Build system, bundler configuration |
| \`ci-cd\` | CI/CD pipelines, GitHub Actions |
| \`devops\` | Deployment, infrastructure as code |
| \`dependencies\` | Package management, version upgrades |
| \`native-modules\` | Native Node.js addons, ABI compatibility |
| \`esm\` | ES modules, import/export |
| \`performance\` | Optimization, profiling, benchmarks |
| \`memory\` | Memory management, leak detection |

### Project-Specific
| Tag | Use for |
|-----|---------|
| \`sqlite\` | SQLite, sqlite-vec, FTS5 |
| \`mcp\` | Model Context Protocol integration |
| \`embedding\` | Vector embeddings, semantic search |
| \`entity-extraction\` | Named entity recognition, graph |
| \`ingest\` | Knowledge ingestion pipeline |

---

## Tagging Examples

| Scenario | Tags |
|----------|------|
| Fixed a TypeScript null reference error | \`bug-fix\`, \`typescript\`, \`null-safety\` |
| Decided to use Zod for validation | \`design-decision\`, \`validation\`, \`typescript\` |
| Found ESM import extension pattern | \`external-knowledge\`, \`esm\`, \`nodejs\` |
| Optimized SQLite FTS5 query | \`performance\`, \`sqlite\`, \`database\` |
| Refactored command handler structure | \`refactoring\`, \`architecture\` |
`,

  "format-examples.md": `# Format Examples

Concrete examples of well-formatted knowledge captures.

---

## Example 1: Bug Fix (TypeScript)

**Title**: Fix "object is possibly undefined" in KnowledgeRepository.getById

**Tags**: \`bug-fix\`, \`typescript\`, \`null-safety\`

**Content**:
\`\`\`
Problem: TypeScript error "object is possibly 'undefined'" when accessing note.id after
calling repository.getById(). The method signature returned Note | undefined but all
call sites assumed Note.

Root cause: The method was added when the codebase was less strict. The return type
correctly reflects that a record might not exist, but call sites were not updated.

Fix:
1. Updated all call sites to handle the undefined case explicitly:
   const note = repository.getById(id);
   if (!note) { throw new Error(\`Note \${id} not found\`); }
2. Added a getByIdOrThrow() helper for cases where undefined is a programming error.

Prevention: Avoid non-null assertions (!). Add repository methods with explicit error
semantics (OrThrow suffix) so callers choose their error handling strategy.
\`\`\`

---

## Example 2: Design Decision (Architecture)

**Title**: Use append-only markers in CLAUDE.md for knowledgine rules section

**Tags**: \`design-decision\`, \`architecture\`

**Content**:
\`\`\`
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
\`\`\`

---

## Example 3: Troubleshooting (Native Module)

**Title**: sqlite-vec fails after Node.js major version upgrade — run npm rebuild

**Tags**: \`troubleshooting\`, \`sqlite\`, \`native-modules\`, \`nodejs\`

**Content**:
\`\`\`
Symptom: "Error: The specified module could not be found" (Windows) or
"invalid ELF header" (Linux) when loading sqlite-vec after upgrading Node.js.

Root cause: Native addons (.node files) are compiled against a specific Node.js ABI
version (NODE_MODULE_VERSION). Upgrading Node.js changes the ABI, making pre-compiled
binaries incompatible.

Diagnosis steps:
1. Confirmed error occurs only after Node upgrade, not on fresh install
2. Checked node-gyp output: "gyp info using node@20.x.x | ABI 115"
3. Found existing .node file compiled for ABI 108 (Node 18)

Resolution: Run \`npm rebuild\` (or \`pnpm rebuild\`) after every Node.js major version
upgrade. This recompiles all native modules for the current ABI.

For CI: Pin NODE_MODULE_VERSION in cache keys to avoid stale compiled artifacts.
\`\`\`

---

## Example 4: Pattern Discovery

**Title**: Pattern: early-return guard clauses to eliminate deep nesting

**Tags**: \`pattern\`, \`refactoring\`

**Content**:
\`\`\`
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
\`\`\`

---

## Example 5: External Knowledge

**Title**: ESM requires .js extension in TypeScript import paths even for .ts source files

**Tags**: \`external-knowledge\`, \`esm\`, \`typescript\`, \`nodejs\`

**Content**:
\`\`\`
Source: https://www.typescriptlang.org/docs/handbook/esm-node.html

Insight: When compiling TypeScript to ESM (module: "NodeNext" or "ESNext" + type:
"module" in package.json), import paths MUST end in .js — not .ts — even when the
source file is .ts.

Reason: TypeScript does not rename import extensions at compile time. The runtime
(Node.js ESM loader) looks for .js files. TypeScript resolves .ts source files when
you write \`import foo from "./foo.js"\` — it knows that .js refers to the compiled .ts.

Applied to this project: All internal imports in packages/cli/src/ use .js extensions.
Forgetting this causes "Cannot find module" at runtime despite TypeScript compiling
successfully (because tsc resolves the type but Node.js cannot find the file).

Gotcha: \`import type\` paths also need .js extensions in strict ESM mode.
\`\`\`
`,
};
