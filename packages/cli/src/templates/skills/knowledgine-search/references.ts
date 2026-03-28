export const REFERENCES: Record<string, string> = {
  "search-strategy.md": `# Search Strategy

How to choose the right search mode, extract context signals, and build an effective
search workflow combining query search, context-based suggestions, and graph traversal.

---

## Mode Selection

### Keyword Mode

Uses SQLite FTS5 full-text search. Matches documents containing the exact words.

**Best for**:
- Exact error messages (e.g., \`"SQLITE_ERROR: no such module: vec0"\`)
- Function or variable names (e.g., \`"capture_knowledge"\`, \`"KnowledgeRepository"\`)
- File paths (e.g., \`"packages/core/src"\`)
- Version strings or identifiers

**Limitations**:
- Does not match synonyms ("fix" will not match "resolve")
- Case-insensitive but word-boundary sensitive
- Phrase order matters in multi-word queries

**Example**:
\`\`\`
search_knowledge(query: "ENOENT no such file or directory", mode: "keyword")
\`\`\`

### Semantic Mode

Uses vector embeddings to match by meaning. Finds related content even without shared words.

**Best for**:
- Conceptual queries (e.g., "how to handle authentication errors")
- When you know what you want but not the exact terms
- Exploring a topic without a specific error message
- Cross-language or paraphrase matching

**Requirements**:
- Knowledge base must have been initialized with \`--semantic\` flag
- Falls back to keyword if embeddings are unavailable

**Example**:
\`\`\`
search_knowledge(query: "user authentication token expiry", mode: "semantic")
\`\`\`

### Hybrid Mode

Combines keyword and semantic scores. Returns the best of both modes.

**Best for**:
- Context-based queries derived from file paths, task descriptions, or feature areas
- Most general-purpose exploration
- When you are unsure which mode is better
- Complex queries mixing exact terms and concepts

**Example**:
\`\`\`
search_knowledge(query: "TypeScript null safety database repository", mode: "hybrid")
\`\`\`

---

## Context Signal Extraction

When you do not have a specific search query, extract signals from the current work context.

### Signal Types

| Signal Type | Example Input | Extracted Query |
|-------------|---------------|-----------------|
| File path | \`src/commands/setup.ts\` | \`"setup command configuration"\` |
| File path | \`packages/core/src/config/config-loader.ts\` | \`"config loader configuration"\` |
| File path | \`packages/ingest/src/plugins/github.ts\` | \`"github ingest plugin"\` |
| Component name | \`SetupCommand\`, \`KnowledgeRepository\` | Use directly as keyword query |
| Task description | "Add support for TOML config files in the setup command" | \`"TOML configuration setup"\` |
| Task description | "Fix entity extraction pipeline for empty documents" | \`"entity extraction empty document"\` |
| Error message | "SQLITE_ERROR: table entities has no column 'confidence'" | \`"SQLITE_ERROR entities column"\` |
| Feature area | MCP configuration | \`"MCP server configuration"\` |
| Feature area | Search | \`"search_knowledge FTS5 semantic"\` |

### Multi-Signal Queries

Combine 2–3 signals for more targeted results:

\`\`\`
// File + task
query: "config-loader TOML parsing"

// Component + problem type
query: "KnowledgeRepository null safety"

// Technology + pattern
query: "sqlite migration schema change"
\`\`\`

---

## Workflow Patterns

### Pattern 1: Session Start

When beginning work on a known area:

1. Extract context from the primary file or feature area
2. Run hybrid search with the combined context query
3. Review top 3–5 results and note any warnings or past decisions
4. Use \`find_related\` with the current file path to discover connected notes
5. Proceed with targeted keyword queries as specific issues arise

\`\`\`
// Step 1: Context-based search
search_knowledge(query: "setup command MCP configuration", mode: "hybrid", limit: 10)

// Step 2: Graph traversal
find_related(filePath: "src/commands/setup.ts", limit: 5)
\`\`\`

### Pattern 2: Error Encountered

When an error or exception occurs:

1. Copy the exact error message
2. Run keyword search with the error message
3. If no results, extract the key noun from the error and try again
4. If still no results, try semantic search with the symptom description

\`\`\`
Error: "Cannot find module '@knowledgine/core'"
→ keyword: "Cannot find module @knowledgine/core"
→ keyword: "module resolution"
→ semantic: "TypeScript module not found build error"
\`\`\`

### Pattern 3: Exploring Unfamiliar Code

When approaching an unfamiliar component or module:

1. Search by file path: \`keyword: "src/commands/setup.ts"\`
2. Search by component name: \`keyword: "setupCommand"\`
3. Search by topic: \`semantic: "MCP configuration setup"\`
4. Traverse the graph from any relevant result: \`find_related(noteId: <id>, maxHops: 2)\`

### Pattern 4: Before Making a Change

Before an architectural decision or significant change:

1. Search for past decisions: \`keyword: "design-decision <topic>"\`
2. Search for related patterns: \`semantic: "<concept> pattern implementation"\`
3. Use \`find_related\` with a relevant noteId to find connected decisions

---

## Result Interpretation

### Keyword Mode (BM25 Score)

Results are ranked by BM25 relevance score. Higher is better; no fixed scale.
Focus on the top 3–5 results unless you are building comprehensive context.

### Semantic Mode (Cosine Similarity)

| Score | Meaning |
|-------|---------|
| > 0.9 | Very strong match — highly likely relevant |
| 0.7–0.9 | Good match — review for applicability |
| 0.5–0.7 | Weak match — may or may not be relevant |
| < 0.5 | Marginal — usually skip unless no better results |

### Hybrid Mode

Scores combine BM25 and cosine similarity. Treat the ranking as a combined signal;
the absolute values are less meaningful than the relative order.

---

## Graph Traversal with find_related

After finding an initial relevant note, use \`find_related\` to discover connected notes:

\`\`\`
// Use the numeric note ID from a search result
find_related(noteId: 42, limit: 5, maxHops: 1)

// Or search by the current file path directly
find_related(filePath: "packages/core/src/config/config-loader.ts", limit: 5)
\`\`\`

**IMPORTANT**: \`noteId\` must be a number (integer), not a string. Use the \`id\` field
from \`search_knowledge\` results directly.

**maxHops guidance**:

| maxHops | Effect |
|---------|--------|
| 1 | Direct references only — fast, focused (default) |
| 2 | One degree of separation — good for exploration |
| 3 | Broader graph — use for open-ended discovery |
`,

  "query-tips.md": `# Query Tips

How to formulate effective search queries for different situations, with templates,
fallback strategies, and limit guidance.

---

## General Principles

1. **Specificity wins** — Specific queries outperform vague ones
   - Bad:  \`"error"\`
   - Good: \`"TypeError cannot read properties of undefined"\`

2. **Use nouns and identifiers** — Verbs and adjectives add noise
   - Bad:  \`"how to fix the broken thing when null"\`
   - Good: \`"null check repository getById"\`

3. **Error messages are gold** — Paste them verbatim for keyword mode

4. **Concepts use natural language** — For semantic mode, describe the situation
   - \`"what approach did we use for caching database results"\`

---

## Query Templates by Situation

### Error Message
\`\`\`
// Paste the exact error message
keyword: "<exact error text>"

// If too long, use the unique part
keyword: "SQLITE_CONSTRAINT UNIQUE"
\`\`\`

### File or Component
\`\`\`
keyword: "<filename without extension>"
keyword: "<ClassName> OR <functionName>"
\`\`\`

### Design Topic
\`\`\`
semantic: "<component> architecture decision"
keyword: "design-decision <topic>"
\`\`\`

### Past Problem
\`\`\`
semantic: "<symptom description in plain language>"
hybrid: "<technology> <problem noun>"
\`\`\`

### Pattern Search
\`\`\`
keyword: "pattern <concept>"
semantic: "reusable pattern for <problem type>"
\`\`\`

### Context-Based (Session Start or File Open)
\`\`\`
// Combine file area + task
hybrid: "<module-name> <task-noun>"

// Feature area
hybrid: "<feature area> <technology>"
\`\`\`

---

## When First Query Returns Nothing

Try these fallback strategies in order:

1. **Broaden the query** — Remove specific identifiers, keep nouns
   - \`"SQLITE_ERROR: table notes has no column 'embedding'"\`
   - → \`"sqlite migration column"\`

2. **Switch modes** — If keyword failed, try semantic or hybrid; if semantic failed,
   try keyword

3. **Synonym query** — Use related terms
   - \`"authentication"\` → \`"auth session token login"\`

4. **Tag-based query** — Search by tag category
   - \`"bug-fix typescript"\`
   - \`"design-decision database"\`

5. **Accept no results** — Not every problem has been captured before. After solving
   it, use knowledgine-capture to record the solution.

---

## Limit Guidance

| Situation | Recommended limit |
|-----------|-------------------|
| Quick lookup (known topic) | 3–5 |
| General exploration | 10 |
| Building full context at session start | 15–20 |
| Finding rare entries | 20 (default) |

The default limit for \`search_knowledge\` is **20**. Use lower limits when your query
is precise to avoid noise. The default limit for \`find_related\` is **5** — this is
appropriate for most graph traversal operations.

Higher limits slow down search marginally; prefer lower limits when the query is precise.
`,
};
