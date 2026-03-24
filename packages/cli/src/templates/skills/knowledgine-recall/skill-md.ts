export const SKILL_MD = `---
name: knowledgine-recall
description: >
  Search the local knowledge base for past solutions, design decisions, and patterns
  before starting work. Invoke when facing an error or exception, when approaching an
  unfamiliar area of the codebase, or when considering implementation approaches.
  Prevents re-solving already-solved problems and surfaces relevant context proactively.
---
# knowledgine-recall

## Purpose

Search accumulated project knowledge before solving problems from scratch. The knowledge
base contains past bug fixes, design decisions, troubleshooting records, and patterns
gathered across all previous sessions. Searching first avoids duplicate work and surfaces
warnings about known pitfalls.

## When to Use

- **Error or exception encountered** — Search for the exact error message or key terms
- **Unfamiliar code area** — Search for context about the component or module
- **Implementation choice** — Search for past decisions on the same topic
- **Considering a library or approach** — Search for known gotchas or prior art
- **Starting work on a file** — Search for related notes about that file path

## When NOT to Use

- Purely mechanical tasks with no ambiguity (renaming a variable, formatting)
- When you have already searched and found no relevant results within this session
- Do not call recall on every single action — use judgment

## How to Search (MCP Tool)

Use the \`search_knowledge\` MCP tool:

\`\`\`
search_knowledge(
  query: string,          // Search query — see query tips below
  mode: "keyword"         // "keyword" | "semantic" | "hybrid"
       | "semantic"       //   keyword: exact text match (fast, precise)
       | "hybrid",        //   semantic: meaning-based (requires embeddings)
                          //   hybrid:   combines both (best results)
  limit?: number          // Max results (default 10)
)
\`\`\`

## How to Search (CLI Alternative)

\`\`\`bash
knowledgine recall "<query>"                    # keyword search
knowledgine recall "<query>" --mode semantic    # semantic search
knowledgine recall "<query>" --mode hybrid      # hybrid search
\`\`\`

## Choosing Search Mode

| Situation | Mode |
|-----------|------|
| You have an exact error message | \`keyword\` |
| You remember specific function or variable names | \`keyword\` |
| You know the concept but not the exact wording | \`semantic\` |
| General exploration of a topic | \`hybrid\` |
| Embeddings not available (FTS5-only setup) | \`keyword\` (only option) |

## Step-by-Step Instructions

1. **Identify the query** — Extract the key terms from the problem (see search-strategy.md)
2. **Choose mode** — keyword for precise terms, semantic or hybrid for concepts
3. **Call search_knowledge** — Pass query, mode, limit (5–10 is usually sufficient)
4. **Evaluate results** — Read the returned notes for relevance
5. **Apply findings** — Use relevant past solutions or decisions to inform your work
6. **Capture if new** — If you discover a new solution, use knowledgine-capture to save it

## Best Practices

- Search before proposing a solution, not after
- Use the actual error message text as a query — it is the most targeted search
- Try multiple queries if the first returns no results
- Combine recall + suggest at session start for comprehensive context

## Reference Files

- See \`search-strategy.md\` for when to use keyword vs semantic vs hybrid
- See \`query-tips.md\` for how to formulate effective queries
`;
