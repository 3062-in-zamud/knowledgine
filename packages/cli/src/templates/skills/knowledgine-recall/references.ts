export const REFERENCES: Record<string, string> = {
  "search-strategy.md": `# Search Strategy

How to choose the right search mode and build an effective recall workflow.

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
- Most general-purpose searches
- When you are unsure which mode is better
- Complex queries mixing exact terms and concepts

**Example**:
\`\`\`
search_knowledge(query: "TypeScript null safety database repository", mode: "hybrid")
\`\`\`

---

## Workflow Patterns

### Pattern 1: Error-first Search

When encountering an error:

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

### Pattern 2: Context Discovery

When starting work on an unfamiliar area:

1. Search by file path: \`keyword: "src/commands/setup.ts"\`
2. Search by component name: \`keyword: "setupCommand"\`
3. Search by topic: \`semantic: "MCP configuration setup"\`

### Pattern 3: Decision Lookup

Before making an architectural choice:

1. Search for past decisions: \`keyword: "design-decision <topic>"\`
2. Search for related patterns: \`semantic: "<concept> pattern implementation"\`
3. Check entity connections: use \`get_entity_graph\` for related components

---

## Result Interpretation

| Score | Meaning |
|-------|---------|
| > 0.9 | Very strong match — highly likely relevant |
| 0.7–0.9 | Good match — review for applicability |
| 0.5–0.7 | Weak match — may or may not be relevant |
| < 0.5 | Marginal — usually skip unless no better results |

For keyword mode, results are ranked by BM25 relevance score (FTS5).
For semantic mode, results are ranked by cosine similarity of embeddings.
`,

  "query-tips.md": `# Query Tips

How to formulate effective search queries for different situations.

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

---

## When First Query Returns Nothing

Try these fallback strategies in order:

1. **Broaden the query** — Remove specific identifiers, keep nouns
   - \`"SQLITE_ERROR: table notes has no column 'embedding'"\`
   - → \`"sqlite migration column"\`

2. **Switch modes** — If keyword failed, try semantic and vice versa

3. **Synonym query** — Use related terms
   - \`"authentication"\` → \`"auth session token login"\`

4. **Tag-based query** — Search by tag category
   - \`"bug-fix typescript"\`
   - \`"design-decision database"\`

5. **Accept no results** — Not every problem has been captured before.
   After solving it, use knowledgine-capture to record the solution.

---

## Limit Guidance

| Situation | Recommended limit |
|-----------|-------------------|
| Quick lookup (known topic) | 3–5 |
| General exploration | 10 (default) |
| Building full context | 15–20 |
| Finding rare entries | 20+ |

Higher limits slow down search marginally; prefer lower limits when query is precise.
`,
};
