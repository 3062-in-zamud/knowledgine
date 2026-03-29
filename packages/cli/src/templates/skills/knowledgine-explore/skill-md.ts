export const SKILL_MD = `---
name: knowledgine-explore
version: "1.0.0"
lang: en
description: >
  Explore entities, knowledge graph connections, and design history for unfamiliar
  components. Invoke when exploring code you did not write, tracing the history of a
  design decision, or understanding how a named entity (technology, library, project,
  component) relates to other parts of the knowledge base.
---
# knowledgine-explore

## Purpose

Trace the knowledge graph to understand why things are the way they are. Explore uses
entity search and graph traversal to surface the full context around a component or
concept — not just what exists, but how it connects to other parts of the system and
what decisions shaped it.

## When to Use

- **Exploring unfamiliar code** — Who wrote what and why? What decisions shaped this?
- **Understanding design rationale** — What alternatives were considered?
- **Tracing knowledge provenance** — Where did this pattern or approach come from?
- **Auditing a technology choice** — Why is this library used here?
- **Understanding relationships** — How do components A and B relate?

## When NOT to Use

- When you just need to find a specific past solution (use knowledgine-search instead)
- When the entity does not exist in the knowledge base yet
- For trivial well-known concepts with no project-specific context

## How to Explore (MCP Tools)

### Step 1: Search for entities

\`\`\`
search_entities(
  query: string,   // Entity name, technology, concept, or person
  limit?: number   // Max results (default 20)
)
\`\`\`

### Step 2: Explore entity graph

\`\`\`
get_entity_graph(
  entityId?: number,    // ID from search_entities result
  entityName?: string   // Or search by name directly
)
\`\`\`

### Step 3: Find related notes

\`\`\`
find_related(
  noteId?: number,    // A relevant note ID found in earlier steps
  filePath?: string,  // Or a relevant file path
  limit?: number,     // Max notes to return (default 5)
  maxHops?: number    // 1–3, default 1
)
\`\`\`

## How to Explore (CLI Alternative)

\`\`\`bash
knowledgine explain "<entity name or concept>"
\`\`\`

## Step-by-Step Instructions

1. **Identify the subject** — What entity, component, or concept do you want to understand?
2. **Search for the entity** — Call \`search_entities\` with the subject name
3. **Inspect the entity graph** — Call \`get_entity_graph\` with the entity ID
4. **Traverse related notes** — Call \`find_related\` for notes that mention this entity
5. **Synthesize findings** — Summarize what you learned about the entity's history and connections

## Best Practices

- Start with \`search_entities\` to discover the exact entity name as stored in the knowledge base
- Use \`get_entity_graph\` to map the neighborhood before diving into individual notes
- Increase \`maxHops\` gradually — start at 1, go to 2 or 3 if the immediate neighborhood is sparse
- Look specifically for notes tagged \`design-decision\` — they explain the "why"

## Edge Cases

- **If the knowledge base is empty** — No entities will be found. Run \`knowledgine-ingest\` first to populate the knowledge base before exploring.
- **If semantic search is unavailable** — Fall back to keyword search by using specific technology or component names as the query string.

## Reference Files

- See \`entity-types.md\` for the entity taxonomy used in knowledgine
- See \`graph-navigation.md\` for how to traverse the knowledge graph effectively
`;
