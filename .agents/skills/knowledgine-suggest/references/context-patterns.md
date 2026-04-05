# Context Patterns

How to extract effective context signals from your current work to generate meaningful
knowledge suggestions.

---

## Context Signal Types

### 1. File Path Context

The file path is often the most precise context signal. It encodes module, feature area,
and component type simultaneously.

**How to use**:

- Pass the file path to `find_related(filePath: "<path>")` directly
- Extract path segments for search queries

**Examples**:
| File Path | Extracted Query |
|-----------|-----------------|
| `src/commands/setup.ts` | `"setup command configuration"` |
| `packages/core/src/config/config-loader.ts` | `"config loader configuration"` |
| `packages/ingest/src/plugins/github.ts` | `"github ingest plugin"` |

### 2. Task Description Context

Transform the task description into a knowledge query by extracting nouns and
technical terms.

**Pattern**:

```
Task: "Add support for TOML config files in the setup command"
Query: "TOML configuration setup"
Query: "config file format"
```

**Pattern**:

```
Task: "Fix the entity extraction pipeline to handle empty documents"
Query: "entity extraction empty document"
Query: "edge case null handling entity"
```

### 3. Error Message Context

When starting work to fix a specific error, use the error as the primary signal.

**Pattern**:

```
Error: "SQLITE_ERROR: table entities has no column 'confidence'"
Query keyword: "SQLITE_ERROR entities column"
Query keyword: "migration entities table"
```

### 4. Feature Area Context

When working on a broad feature, search for the feature domain.

**Examples**:
| Feature Area | Context Query |
|-------------|---------------|
| Authentication | `"authentication session token"` |
| Search | `"search_knowledge FTS5 semantic"` |
| Ingest pipeline | `"ingest plugin markdown"` |
| MCP server | `"MCP server start file watcher"` |

---

## Multi-Signal Queries

Combine 2–3 signals for more targeted results:

```
// File + task
query: "config-loader TOML parsing"

// Component + problem type
query: "KnowledgeRepository null safety"

// Technology + pattern
query: "sqlite migration schema change"
```

---

## Using find_related for Graph Traversal

After finding an initial relevant note, use `find_related` to discover connected notes:

```
// Found note ID "abc123" about config loading
find_related(noteId: "abc123", limit: 10, maxHops: 2)

// Or search by the current file path directly
find_related(filePath: "packages/core/src/config/config-loader.ts", limit: 10)
```

**maxHops guidance**:
| maxHops | Effect |
|---------|--------|
| 1 | Direct references only — fast, focused |
| 2 | One degree of separation — good default |
| 3 | Broader graph — use for open-ended exploration |

---

## Suggest vs Recall Decision Guide

| Situation                                      | Use                        |
| ---------------------------------------------- | -------------------------- |
| You have a specific error message              | knowledgine-recall         |
| You know exactly what to search for            | knowledgine-recall         |
| You are starting work, unsure what is relevant | knowledgine-suggest        |
| You want to discover what you don't know       | knowledgine-suggest        |
| You have a file path but no specific query     | knowledgine-suggest        |
| You want both targeted + exploratory           | suggest first, then recall |
