export const REFERENCES: Record<string, string> = {
  "entity-types.md": `# Entity Types

The entity types recognized and extracted by knowledgine from knowledge base content.

---

## Core Entity Types

| Type | Description | Examples |
|------|-------------|---------|
| \`technology\` | Libraries, frameworks, tools, languages | \`SQLite\`, \`TypeScript\`, \`Node.js\`, \`Zod\` |
| \`concept\` | Abstract ideas, patterns, architectural concepts | \`caching\`, \`ESM\`, \`FTS5\`, \`semantic search\` |
| \`project\` | Projects, repositories, products | \`knowledgine\`, \`claude-code\` |
| \`person\` | Authors, contributors, contacts | Team members, external contributors |
| \`component\` | Code components, classes, modules | \`KnowledgeRepository\`, \`IngestEngine\` |
| \`command\` | CLI commands or API operations | \`knowledgine init\`, \`capture_knowledge\` |
| \`file\` | Source files and paths | \`packages/core/src/config/config-loader.ts\` |
| \`error\` | Named error types or error messages | \`SQLITE_CONSTRAINT\`, \`ENOENT\` |

---

## Searching for Entities

### By exact name
\`\`\`
search_entities(query: "SQLite")
search_entities(query: "KnowledgeRepository")
\`\`\`

### By type + name
\`\`\`
search_entities(query: "technology sqlite")
search_entities(query: "concept caching")
\`\`\`

### By partial name
\`\`\`
search_entities(query: "Knowledge")  // matches KnowledgeRepository, knowledgine, etc.
\`\`\`

---

## Entity Extraction Quality

Entities are extracted automatically from note content using NLP. The quality depends
on the clarity of the notes. If you notice missing or incorrect entities, use
\`knowledgine-feedback\` to report them.

**Common extraction issues**:
- Abbreviations (TS → TypeScript may not be linked)
- Generic words that happen to be class names (Table, Manager)
- Multi-word entities where only part is captured

---

## Using Entities for Exploration

Entities serve as navigation hubs in the knowledge graph. A technology entity like
\`SQLite\` connects to every note that mentions SQLite, allowing you to traverse from
the entity to all related bug fixes, design decisions, and patterns.

**Exploration pattern**:
\`\`\`
1. search_entities(query: "SQLite") → get entity ID
2. get_entity_graph(entityId: "<id>") → see all connections
3. find_related(noteId: "<connected note id>") → traverse outward
\`\`\`
`,

  "graph-navigation.md": `# Graph Navigation

How to traverse the knowledge graph effectively using \`get_entity_graph\` and
\`find_related\`.

---

## Knowledge Graph Structure

The knowledge graph has two node types:

- **Notes** — Individual knowledge entries (bug fixes, decisions, patterns, etc.)
- **Entities** — Named things extracted from notes (technologies, concepts, people)

**Edge types**:
- Note → Entity: "this note mentions this entity"
- Entity → Note: "this entity appears in these notes"
- Note → Note: "these notes share entities" (implicit through entity connections)

---

## get_entity_graph

Returns the entity and all notes it appears in, plus related entities.

\`\`\`
get_entity_graph(entityId: "123")
// Returns: { entity, notes: [...], relatedEntities: [...] }

get_entity_graph(entityName: "SQLite")
// Look up entity by name then return graph
\`\`\`

**Use this when you want to**:
- See every note about a specific technology or concept
- Discover which other entities co-appear with this entity
- Get an overview before doing deeper traversal

---

## find_related

Returns notes related to a starting point (note or file path) via shared entities.

\`\`\`
find_related(noteId: "abc123", limit: 10, maxHops: 2)
find_related(filePath: "src/commands/setup.ts", limit: 10)
\`\`\`

**Parameters**:
- \`noteId\` or \`filePath\`: Starting point for traversal
- \`limit\`: Maximum notes to return
- \`maxHops\`: How many edge-traversal steps to allow (1–3)

### maxHops Guide

| maxHops | Meaning | When to use |
|---------|---------|-------------|
| 1 | Only notes that share a direct entity with the starting note | Focused lookup |
| 2 | Notes 2 hops away (share an entity with a 1-hop note) | Default, good balance |
| 3 | Notes 3 hops away | Open-ended exploration, large graph |

**Higher maxHops returns more results but with lower average relevance.** Start at 1
or 2 and increase only if the results are too sparse.

---

## Navigation Patterns

### Pattern 1: Technology Deep Dive

\`\`\`
// Understand everything in the knowledge base about TypeScript
1. search_entities(query: "TypeScript") → { id: "42", name: "TypeScript" }
2. get_entity_graph(entityId: "42")
   → 15 notes mention TypeScript
   → related entities: ESM, tsconfig, type-safety
3. find_related(noteId: "<top note id>", maxHops: 2)
   → Surface adjacent notes
\`\`\`

### Pattern 2: Component History

\`\`\`
// Understand the history of the setup command
1. search_entities(query: "setupCommand") → entity
2. get_entity_graph(entityId: "<id>") → notes about setupCommand
3. Filter for design-decision and refactoring notes
4. Read chronologically to understand evolution
\`\`\`

### Pattern 3: Cross-Area Connections

\`\`\`
// Find connections between two components
1. get_entity_graph(entityName: "IngestEngine") → set A of notes + entities
2. get_entity_graph(entityName: "KnowledgeRepository") → set B
3. Inspect overlap in relatedEntities to find bridges
\`\`\`

---

## Interpreting Results

When \`get_entity_graph\` returns many notes, prioritize by tag:

| Priority | Tags |
|----------|------|
| High | \`design-decision\`, \`bug-fix\`, \`troubleshooting\` |
| Medium | \`pattern\`, \`refactoring\`, \`external-knowledge\` |
| Lower | Untagged notes |
`,
};
