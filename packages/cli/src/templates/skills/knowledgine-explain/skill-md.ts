export const SKILL_MD = `---
name: knowledgine-explain
description: >
  Explore entities, knowledge graph connections, and design history for unfamiliar
  components. Invoke when exploring code you did not write, tracing the history of a
  design decision, or understanding how a named entity (technology, library, project,
  person) relates to other parts of the knowledge base.
---
# knowledgine-explain

## Purpose

Trace the knowledge graph to understand why things are the way they are. Explain uses
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

- When you just need to find a specific past solution (use knowledgine-recall instead)
- When the entity does not exist in the knowledge base yet
- For trivial well-known concepts with no project-specific context

## How to Explain (MCP Tools)

### Step 1: Search for entities

\`\`\`
search_entities(
  query: string,   // Entity name, technology, concept, or person
  limit?: number   // Max results (default 10)
)
\`\`\`

### Step 2: Explore entity graph

\`\`\`
get_entity_graph(
  entityId?: string,    // ID from search_entities result
  entityName?: string   // Or search by name directly
)
\`\`\`

### Step 3: Find related notes

\`\`\`
find_related(
  noteId?: string,    // A relevant note ID found in earlier steps
  filePath?: string,  // Or a relevant file path
  limit?: number,
  maxHops?: number    // 1–3, default 2
)
\`\`\`

## How to Explain (CLI Alternative)

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

## Reference Files

- See \`entity-types.md\` for the entity taxonomy used in knowledgine
- See \`graph-navigation.md\` for how to traverse the knowledge graph effectively
`;
