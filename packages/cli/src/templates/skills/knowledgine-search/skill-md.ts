export const SKILL_MD = `---
name: knowledgine-search
version: "1.0.0"
lang: en
description: >
  Search the local knowledge base for past solutions, design decisions, and patterns.
  Invoke when facing an error, approaching unfamiliar code, starting a session, opening
  a new file, or considering implementation approaches. Supports three modes: direct
  query search, context-based suggestions, and graph-based related note discovery.
---
# knowledgine-search

## Purpose

Search accumulated project knowledge before solving problems from scratch. The knowledge
base contains past bug fixes, design decisions, troubleshooting records, and patterns
gathered across all previous sessions. This skill unifies direct query search and
context-based discovery into a single workflow, preventing duplicate work and surfacing
relevant context proactively.

## When to Use

- **Error or exception encountered** — Search for the exact error message or key terms
- **Unfamiliar code area** — Search for context about the component or module
- **Implementation choice** — Search for past decisions on the same topic
- **Considering a library or approach** — Search for known gotchas or prior art
- **Starting a session** — Get context about the area you will work in
- **Opening a new file** — Discover past knowledge about that component
- **Beginning a feature** — Find related patterns and past decisions
- **Starting work on a file** — Search for related notes about that file path

## When NOT to Use

- Purely mechanical tasks with no ambiguity (renaming a variable, formatting)
- When you have already searched and found no relevant results within this session
- After already running context-based search for the same file in the same session
- Do not call search on every single action — use judgment

## Search Approaches

### Approach 1: Query Search

You have specific terms — an error message, a function name, or a known topic.

Use \`search_knowledge\` with the specific terms. Start with \`keyword\` mode for exact
matches; switch to \`semantic\` or \`hybrid\` when the exact wording is uncertain.

### Approach 2: Context-Based Search

You are starting work on a file or task without a specific query in mind.

Extract signals from the current file path, component name, task description, or error
message. Combine 2–3 signals into a query and use \`hybrid\` mode for best results. See
\`search-strategy.md\` for how to extract context signals.

### Approach 3: Related Note Discovery

You have found a relevant note and want to discover connected notes in the knowledge graph.

Call \`find_related\` with the \`noteId\` (as a number) from the relevant result, or with
the current \`filePath\`. This traverses the knowledge graph to surface notes linked by
entity relationships, problem-solution pairs, and file associations.

## Choosing Search Mode

| Situation | Mode |
|-----------|------|
| You have an exact error message | \`keyword\` |
| You remember specific function or variable names | \`keyword\` |
| You know the concept but not the exact wording | \`semantic\` |
| Starting work with context signals (file, task, feature) | \`hybrid\` |
| General exploration of a topic | \`hybrid\` |
| Embeddings not available (FTS5-only setup) | \`keyword\` (only option) |

## How to Search (MCP Tools)

### search_knowledge

\`\`\`
search_knowledge(
  query: string,              // Search query
  mode?: "keyword"            // "keyword" | "semantic" | "hybrid"
       | "semantic"           //   keyword:  exact text match via FTS5 (default)
       | "hybrid",            //   semantic: meaning-based, requires embeddings
                              //   hybrid:   combines both
  limit?: number,             // Max results (default: 20)
  agentic?: boolean,          // Include deprecated notes (default: false)
  includeDeprecated?: boolean // Include deprecated notes (default: false)
)
\`\`\`

### find_related

\`\`\`
find_related(
  noteId?: number,    // ID of a note — must be a NUMBER (integer), not a string
  filePath?: string,  // File path to find related notes for
  limit?: number,     // Max results (default: 5)
  maxHops?: number    // Graph traversal depth (default: 1, max: 3)
)
\`\`\`

Provide at least one of \`noteId\` or \`filePath\`. \`noteId\` values come from
\`search_knowledge\` results — use the numeric \`id\` field directly.

## How to Search (CLI Alternative)

\`\`\`bash
knowledgine search "<query>"                     # keyword search
knowledgine search "<query>" --mode semantic     # semantic search
knowledgine search "<query>" --mode hybrid       # hybrid search
knowledgine suggest --file src/commands/setup.ts # context-based by file path
\`\`\`

## Step-by-Step Instructions

1. **Choose your approach** — Do you have a specific query (Approach 1), or are you
   starting from context like a file path or task description (Approach 2)?

2. **Extract your query**
   - For Approach 1: Use the error message, function name, or known topic directly
   - For Approach 2: Extract signals from file path, component name, task, or error;
     combine 2–3 signals into a query (see \`search-strategy.md\`)

3. **Choose the mode**
   - Exact terms → \`keyword\`
   - Context signals or conceptual search → \`hybrid\`
   - Known concept, uncertain wording → \`semantic\`

4. **Call search_knowledge** — Pass query, mode, and limit (5–10 is usually sufficient;
   default is 20)

5. **Evaluate results** — Read the returned notes for relevance; note any IDs of
   highly relevant results

6. **Traverse related notes (optional)** — If a result looks highly relevant, call
   \`find_related\` with its numeric \`noteId\` or the current \`filePath\` to discover
   connected notes via the knowledge graph

7. **Apply findings** — Use relevant past solutions or decisions to inform your work

8. **Capture if new** — If you discover a new solution, use knowledgine-capture to
   save it

## Best Practices

- Search before proposing a solution, not after
- Use the actual error message text as a query — it is the most targeted search
- Try multiple queries if the first returns no results
- At session start, run a context-based search (Approach 2) for the primary work area,
  then use targeted queries (Approach 1) as specific issues arise
- Prioritize notes tagged with \`bug-fix\` or \`troubleshooting\` — they contain warnings
- Notes tagged \`design-decision\` are especially valuable before making changes
- The \`noteId\` parameter of \`find_related\` is a number — pass the integer id field
  from search results, not a string

## Edge Cases

- **Knowledge base is empty** — If \`search_knowledge\` returns no results at all,
  the knowledge base may not have been populated yet. Suggest using knowledgine-ingest
  to index the codebase or knowledgine-capture to start recording knowledge.
- **Semantic or hybrid mode returns an error** — Embeddings may not be configured.
  Fall back to \`keyword\` mode, which relies only on SQLite FTS5 and always works.
- **find_related returns an error for a noteId** — Confirm the value is a positive
  integer from a \`search_knowledge\` result, not a string representation.

## Reference Files

- See \`search-strategy.md\` for mode selection, context signal extraction, workflow
  patterns, and result interpretation
- See \`query-tips.md\` for query formulation templates, fallback strategies, and
  limit guidance
`;
