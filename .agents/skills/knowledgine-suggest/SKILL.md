---
name: knowledgine-suggest
description: >
  Get contextual knowledge suggestions based on the current work context — the file
  being edited, the task being performed, or the error being investigated. Invoke at
  the start of a work session, when opening a new file, or when beginning a feature.
  Surfaces relevant past knowledge proactively without requiring a specific query.
---

# knowledgine-suggest

## Purpose

Surface relevant knowledge from the knowledge base based on contextual signals extracted
from the current work, rather than a specific search query. Suggest combines search and
graph traversal to bring forward knowledge you might not know to search for.

## When to Use

- **Starting a session** — Get context about the area you will work in
- **Opening a new file** — Discover past knowledge about that component
- **Beginning a feature** — Find related patterns and past decisions
- **Before making changes** — Check for warnings or prior art on the topic
- **Exploring an unfamiliar module** — Find related entities and notes

## When NOT to Use

- When you already have a specific query in mind (use knowledgine-recall instead)
- When working on trivial mechanical tasks with no design ambiguity
- After already calling suggest for the same file in the same session

## How to Get Suggestions (MCP Tools)

### Step 1: Search by context

```
search_knowledge(
  query: string,   // Derived from file path, task description, or component name
  mode: "hybrid",  // Hybrid gives best results for context-based queries
  limit: 10
)
```

### Step 2: Find related notes (if you have a note ID or file path)

```
find_related(
  noteId?: string,    // ID of a relevant note found in step 1
  filePath?: string,  // Current file path being worked on
  limit?: number,     // Max results (default 10)
  maxHops?: number    // Graph traversal depth (default 2)
)
```

## How to Get Suggestions (CLI Alternative)

```bash
knowledgine suggest "<context description>"
knowledgine suggest --file src/commands/setup.ts
```

## Extracting Context

The quality of suggestions depends on the context you provide. Extract signals from:

| Signal                  | Example                                           |
| ----------------------- | ------------------------------------------------- |
| Current file path       | `src/commands/setup.ts`                           |
| Component or class name | `SetupCommand`, `KnowledgeRepository`             |
| Task description        | `"add TOML config support to setup command"`      |
| Feature area            | `"MCP configuration", "entity extraction"`        |
| Error message           | `"TypeError: Cannot set properties of undefined"` |

## Step-by-Step Instructions

1. **Extract context signals** from the current task (see context-patterns.md)
2. **Build a query** — Combine the most specific signals into a search query
3. **Call search_knowledge** with mode: "hybrid" and the derived query
4. **Review results** — Read the top 3–5 most relevant notes
5. **Traverse related notes** — Call find_related with a relevant noteId or the current filePath
6. **Summarize findings** — Note any relevant warnings, patterns, or decisions found
7. **Proceed informed** — Use the discovered context to guide your implementation

## Best Practices

- Run suggest once at session start for the primary area of work
- Combine with knowledgine-recall for targeted queries as specific issues arise
- Prioritize notes tagged with `bug-fix` or `troubleshooting` — they contain warnings
- Notes tagged `design-decision` are especially valuable before making changes

## Reference Files

- See `context-patterns.md` for how to extract effective context from your current work
