---
name: knowledgine-capture
description: >
  Record knowledge to the local knowledge base after solving problems, making design
  decisions, or discovering reusable patterns. Invoke whenever you have just fixed a bug,
  made an architectural choice, found a reusable pattern, learned something from external
  sources, or completed a refactoring. Capturing while context is fresh prevents knowledge
  loss across sessions.
---

# knowledgine-capture

## Purpose

Persist valuable learnings from the current session into the local knowledge base so they
are available for future sessions and team members. The knowledge base is only as useful
as what is recorded into it.

## When to Use

Capture knowledge when **any** of the following events occur in the session:

1. **Bug fix** — You identified a root cause and applied a solution
2. **Design decision** — You chose one approach over alternatives with reasoning
3. **Pattern discovery** — You found a reusable pattern worth applying elsewhere
4. **Troubleshooting** — You worked through a non-obvious diagnosis process
5. **External knowledge** — You applied insights from documentation, articles, or Stack Overflow
6. **Refactoring** — You improved existing code with a clear before/after

## When NOT to Use

- Trivial edits (typo fixes, formatting changes) that contain no transferable insight
- Highly project-specific one-off changes with no reuse value
- Duplicate entries: first search with `search_knowledge` to check if the knowledge already exists

## How to Capture (MCP Tool)

Use the `capture_knowledge` MCP tool:

```
capture_knowledge(
  content: string,   // Full explanation: problem + solution + context
  title: string,     // Short descriptive title (max ~80 chars)
  tags: string[],    // 2–5 tags from the standard taxonomy
  source?: string    // Optional: URL, filename, or reference source
)
```

## How to Capture (CLI Alternative)

```bash
knowledgine capture add "<content>" --title "<title>" --tags "<tag1>,<tag2>"
```

## Content Format

Structure each capture as three parts:

1. **Problem / Context** — What situation triggered this learning?
2. **Solution / Decision** — What was done and how?
3. **Rationale / Notes** — Why this approach? What alternatives were considered?

Example:

```
**Problem**: TypeScript threw "Type 'unknown' is not assignable to type 'User'" when
parsing API response.

**Solution**: Added a type guard function isUser(val: unknown): val is User that checks
for required fields before narrowing the type.

**Rationale**: Using 'as User' cast was unsafe because the API response structure could
change. The type guard provides runtime validation and compile-time safety.
```

## Step-by-Step Instructions

1. **Identify the trigger** — Which of the 6 capture events occurred?
2. **Draft the content** — Write problem + solution + rationale in plain prose
3. **Choose a title** — Concise, searchable (start with verb or noun phrase)
4. **Select 2–5 tags** — Use the standard taxonomy (see capture-guide.md)
5. **Call capture_knowledge** — Pass content, title, tags, and optional source
6. **Verify** — Confirm the tool returned a success response

## Best Practices

- Capture immediately after the event while details are fresh
- Write for a future reader who has no context from this session
- Prefer one focused capture per insight over large omnibus entries
- Include error messages verbatim — they are the most effective search terms
- Tag precisely: broad tags like "misc" reduce discoverability

## Reference Files

- See `capture-guide.md` for detailed guidance on each trigger type with examples
- See `tag-taxonomy.md` for the standard tag categories
- See `format-examples.md` for 3–5 concrete capture examples
