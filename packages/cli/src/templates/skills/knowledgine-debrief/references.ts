export const REFERENCES: Record<string, string> = {
  "debrief-template.md": `# Debrief Template

Fill in the following template when creating a session debrief capture. Omit sections
that are not applicable.

---

\`\`\`markdown
## Session Debrief: <YYYY-MM-DD> — <Main Topic>

### Overview
<1–2 sentence summary of the session goal and outcome>

### Problems Solved
<!-- List each significant problem with root cause and solution -->
- **<Problem title>**
  - Root cause: <what caused it>
  - Solution: <what was done>
  - Files changed: <list of files>

### Decisions Made
<!-- List architectural or implementation decisions with reasoning -->
- **<Decision title>**
  - Options considered: <A, B, C>
  - Chosen: <option>
  - Reason: <why>

### Patterns Found
<!-- Reusable insights or patterns discovered this session -->
- **<Pattern name>**: <brief description and when to apply>

### Code Changed
<!-- Summary of what was changed and why -->
| File | Change | Purpose |
|------|--------|---------|
| <path> | <created/modified/deleted> | <why> |

### Open Questions
<!-- Unresolved items for future sessions -->
- <Question or uncertainty>
- <What needs investigation or decision>

### References
<!-- External sources consulted this session -->
- <URL or document title>
\`\`\`

---

## Usage Notes

**Title format**: "Session Debrief: 2026-03-15 — Entity extraction pipeline fix"

**Tags**: Always include \`debrief\`. Add the primary topic area:
- \`debrief\`, \`bug-fix\` — session primarily fixed bugs
- \`debrief\`, \`design-decision\` — session was design-focused
- \`debrief\`, \`refactoring\` — session was refactoring-focused
- \`debrief\`, \`feature\` — session added new functionality

**Minimum viable debrief**: If time is short, at minimum capture:
1. What was done (one sentence per task)
2. Key decisions or gotchas
3. Open questions

**Separate captures**: For major bugs or decisions, create individual captures first
(using knowledgine-capture), then reference them in the debrief summary. This
ensures the individual insights are searchable by type, not only through the debrief.
`,

  "example-output.md": `# Example Debrief Output

A concrete example of a well-written session debrief.

---

**Title**: Session Debrief: 2026-03-15 — ESM import resolution and sqlite-vec fix

**Tags**: \`debrief\`, \`bug-fix\`

**Content**:
\`\`\`markdown
## Session Debrief: 2026-03-15 — ESM import resolution and sqlite-vec fix

### Overview
Fixed two build-time failures introduced by upgrading to Node.js 20: ESM import
extensions were missing in CLI source files, and sqlite-vec native module needed
recompilation for the new ABI.

### Problems Solved

- **Missing .js extensions in ESM imports**
  - Root cause: TypeScript source used extensionless imports (e.g., \`import foo from "./foo"\`)
    which works with CommonJS but fails in strict ESM mode (Node 20 + type: "module").
  - Solution: Added .js extensions to all relative imports in packages/cli/src/
    and packages/core/src/. Updated tsconfig to moduleResolution: "NodeNext".
  - Files changed: ~40 files across cli and core packages

- **sqlite-vec "invalid ELF header" on Node 20**
  - Root cause: Native .node binary was compiled for Node 18 ABI (NODE_MODULE_VERSION 108).
    Node 20 uses ABI 115.
  - Solution: Ran \`npm rebuild\` to recompile sqlite-vec for Node 20. Added ABI version
    check to CI cache key to prevent recurrence.
  - Files changed: No source changes; CI workflow updated

### Decisions Made

- **Keep moduleResolution: NodeNext permanently**
  - Options: Revert to CommonJS, or update to NodeNext
  - Chosen: NodeNext. ESM is the direction Node.js is heading; reverting would
    accumulate more migration debt. The .js extension requirement is a one-time cost.

### Patterns Found

- **npm rebuild after Node.js major upgrades**: Any project using native modules must
  run \`npm rebuild\` after upgrading Node.js major version. Add this to upgrade
  runbooks. See also: individual capture "sqlite-vec fails after Node.js upgrade".

### Code Changed

| File | Change | Purpose |
|------|--------|---------|
| packages/cli/src/**/*.ts | modified | Add .js to all relative imports |
| packages/core/src/**/*.ts | modified | Add .js to all relative imports |
| tsconfig.json | modified | moduleResolution: NodeNext |
| .github/workflows/ci.yml | modified | Add NODE_ABI to cache key |

### Open Questions

- Is there a codemod or lint rule that enforces .js extensions? ESLint import plugin
  might handle this — investigate for future use.
- Should the knowledgine init command detect ABI mismatch proactively?

### References

- https://www.typescriptlang.org/docs/handbook/esm-node.html
- https://nodejs.org/api/esm.html#mandatory-file-extensions
\`\`\`
`,
};
