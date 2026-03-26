# SEP-DRAFT: Memory Protocol for MCP Servers

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-03-26
- **Author(s)**: Knowledgine Team
- **Sponsor**: None (seeking sponsor)
- **PR**: (not yet submitted)

---

## Abstract

This SEP proposes a standardized memory management interface for MCP servers,
enabling AI assistants to persist and retrieve knowledge across sessions. The
proposal defines four core operations (`store_memory`, `recall_memory`,
`update_memory`, `forget_memory`), a three-layer memory model (episodic,
semantic, procedural), an immutable version chain for update history, and
point-in-time recall. All features beyond the four core operations are declared
via capability negotiation, allowing implementations to adopt the standard
incrementally.

---

## Motivation

Large language models are stateless: each session begins with no memory of
prior interactions. For AI coding assistants, this means developers must
repeatedly re-explain project conventions, past debugging findings, and
architectural decisions.

Three distinct problems motivate this proposal:

1. **Session boundary amnesia.** Stateless sessions force users to re-establish
   context manually. For long-running projects, the accumulated context can be
   substantial (preferred libraries, naming conventions, known footguns,
   ongoing refactors).

2. **Lack of a developer-appropriate memory model.** Developer knowledge is
   different from generic user data. It includes procedural knowledge (how to
   do things), episodic knowledge (what happened in a debugging session), and
   semantic knowledge (what a concept means in this codebase). This knowledge
   becomes outdated and needs versioned updates, not simple overwrites.

3. **No interoperability between existing memory systems.** Claude Code,
   Cursor, Windsurf, and other AI coding tools each implement memory
   independently. Developers who switch tools lose their accumulated context.
   Open-source solutions such as Mem0, Zep, and Basic Memory are not
   interoperable with each other or with commercial tools.

A standardized MCP memory interface would allow any MCP client to work with
any conforming memory server, and would allow memory data to be shared across
tools without vendor lock-in.

---

## Specification

### Memory Model

This proposal adopts a three-layer model reflecting different timescales of
knowledge retention:

| Layer      | Identifier   | Concept    | Retention                                                |
| ---------- | ------------ | ---------- | -------------------------------------------------------- |
| Episodic   | `episodic`   | Short-term | Recent events, temporary context                         |
| Semantic   | `semantic`   | Mid-term   | Repeatedly accessed knowledge, conceptual understanding  |
| Procedural | `procedural` | Long-term  | Coding patterns, design principles, established know-how |

Each memory entry belongs to exactly one layer. Implementations MAY support
automatic layer promotion (capability: `layer_promotion`) based on access
frequency. Reference thresholds (implementation-dependent):

- `episodic` → `semantic`: access count ≥ 3
- `semantic` → `procedural`: access count ≥ 10

### Core Operations

All conforming implementations MUST implement the following four operations as
MCP tools registered via `tools/list` and callable via `tools/call`.

#### `store_memory`

Creates a new memory entry.

**Input:**

| Field      | Type                                       | Required | Description                                              |
| ---------- | ------------------------------------------ | -------- | -------------------------------------------------------- |
| `content`  | `string`                                   | REQUIRED | Memory text. Empty string MUST return `INVALID_CONTENT`. |
| `layer`    | `"episodic" \| "semantic" \| "procedural"` | OPTIONAL | Target layer. Default: `"episodic"`.                     |
| `metadata` | `MemoryMetadata`                           | OPTIONAL | Extensible metadata object (see Data Types).             |
| `tags`     | `string[]`                                 | OPTIONAL | Classification tags.                                     |
| `ttl`      | `number`                                   | OPTIONAL | Time-to-live in seconds. Requires capability `ttl`.      |

**Output:**

| Field       | Type     | Required | Description                      |
| ----------- | -------- | -------- | -------------------------------- |
| `id`        | `string` | REQUIRED | Identifier of the created entry. |
| `layer`     | `string` | REQUIRED | Layer the entry was stored in.   |
| `version`   | `number` | REQUIRED | Always `1` for new entries.      |
| `createdAt` | `string` | REQUIRED | ISO 8601 creation timestamp.     |

**Errors:**

| Code              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `INVALID_CONTENT` | `content` is empty or null.                          |
| `INVALID_LAYER`   | `layer` value is not one of the defined identifiers. |
| `STORAGE_ERROR`   | Backend persistence failed.                          |

---

#### `recall_memory`

Retrieves memory entries matching the given criteria. When `query` is omitted,
returns the most recently accessed entries. Implementations SHOULD increment
`accessCount` on retrieved entries.

**Input:**

| Field                   | Type           | Required | Description                                                                        |
| ----------------------- | -------------- | -------- | ---------------------------------------------------------------------------------- |
| `query`                 | `string`       | OPTIONAL | Full-text search query.                                                            |
| `filter`                | `RecallFilter` | OPTIONAL | Structured filter (see Data Types).                                                |
| `limit`                 | `number`       | OPTIONAL | Max results. Default: 10. Max: 100.                                                |
| `asOf`                  | `string`       | OPTIONAL | ISO 8601 timestamp for point-in-time recall. Requires capability `temporal_query`. |
| `includeVersionHistory` | `boolean`      | OPTIONAL | Include deprecated versions. Default: `false`. Requires capability `versioning`.   |

**Output:**

| Field        | Type               | Required | Description                                  |
| ------------ | ------------------ | -------- | -------------------------------------------- |
| `memories`   | `RecalledMemory[]` | REQUIRED | Retrieved entries.                           |
| `totalCount` | `number`           | REQUIRED | Total matching entries (before `limit`).     |
| `hasMore`    | `boolean`          | REQUIRED | `true` if results were truncated by `limit`. |

**RecalledMemory fields:**

| Field            | Type             | Required | Description                                                   |
| ---------------- | ---------------- | -------- | ------------------------------------------------------------- |
| `id`             | `string`         | REQUIRED | Entry identifier.                                             |
| `content`        | `string`         | REQUIRED | Memory text.                                                  |
| `summary`        | `string`         | OPTIONAL | Auto-generated or stored summary.                             |
| `layer`          | `string`         | REQUIRED | Memory layer.                                                 |
| `version`        | `number`         | REQUIRED | Version number.                                               |
| `relevanceScore` | `number`         | OPTIONAL | 0.0–1.0. Present when capability `semantic_search` is active. |
| `accessCount`    | `number`         | REQUIRED | Cumulative access count.                                      |
| `tags`           | `string[]`       | REQUIRED | Tags (empty array if none).                                   |
| `metadata`       | `MemoryMetadata` | OPTIONAL | Metadata object.                                              |
| `createdAt`      | `string`         | REQUIRED | ISO 8601 creation timestamp.                                  |
| `updatedAt`      | `string`         | OPTIONAL | ISO 8601 last-update timestamp.                               |
| `lastAccessedAt` | `string`         | OPTIONAL | ISO 8601 last-access timestamp.                               |

---

#### `update_memory`

Updates an existing memory entry. When `createVersion` is `true` (default),
creates a new entry and marks the old one as deprecated, forming an immutable
version chain. Requires capability `versioning` for `createVersion: true`.

**Input:**

| Field           | Type                      | Required | Description                                                                        |
| --------------- | ------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `id`            | `string`                  | REQUIRED | Entry to update.                                                                   |
| `content`       | `string`                  | OPTIONAL | New text.                                                                          |
| `summary`       | `string`                  | OPTIONAL | New summary.                                                                       |
| `tags`          | `string[]`                | OPTIONAL | Replacement tag array.                                                             |
| `metadata`      | `Partial<MemoryMetadata>` | OPTIONAL | Metadata fields to merge.                                                          |
| `createVersion` | `boolean`                 | OPTIONAL | Create a new version. Default: `true`. When `false`, in-place update (no history). |

**Output:**

| Field             | Type     | Required | Description                                                  |
| ----------------- | -------- | -------- | ------------------------------------------------------------ |
| `id`              | `string` | REQUIRED | ID after update. New ID if `createVersion: true`.            |
| `version`         | `number` | REQUIRED | Version number after update.                                 |
| `previousVersion` | `number` | OPTIONAL | Previous version number. Present when `createVersion: true`. |
| `updatedAt`       | `string` | REQUIRED | ISO 8601 update timestamp.                                   |

**Errors:**

| Code               | Description                          |
| ------------------ | ------------------------------------ |
| `MEMORY_NOT_FOUND` | No entry exists with the given `id`. |
| `VERSION_CONFLICT` | Concurrent update collision.         |

---

#### `forget_memory`

Removes or deactivates a memory entry.

**Input:**

| Field    | Type      | Required | Description                                        |
| -------- | --------- | -------- | -------------------------------------------------- |
| `id`     | `string`  | REQUIRED | Entry to remove.                                   |
| `reason` | `string`  | OPTIONAL | Deletion reason for audit log.                     |
| `hard`   | `boolean` | OPTIONAL | Physical deletion. Default: `false` (soft delete). |

**Output:**

| Field       | Type               | Required | Description               |
| ----------- | ------------------ | -------- | ------------------------- |
| `id`        | `string`           | REQUIRED | ID of the affected entry. |
| `forgotten` | `boolean`          | REQUIRED | `true` on success.        |
| `method`    | `"soft" \| "hard"` | REQUIRED | Deletion method used.     |

**Deletion semantics:**

- **Soft forget** (`hard: false`): Sets `deprecated: true` and records
  `reason` in `deprecationReason`. The entry remains physically and is
  retrievable via `recall_memory(includeVersionHistory: true)`.
- **Hard forget** (`hard: true`): Physically deletes the entry. Irreversible.
  Implementations SHOULD log hard-forget operations in an audit trail.

**Errors:**

| Code               | Description                          |
| ------------------ | ------------------------------------ |
| `MEMORY_NOT_FOUND` | No entry exists with the given `id`. |

---

### Data Types

#### MemoryEntry

| Field               | Type                                       | Description                                         |
| ------------------- | ------------------------------------------ | --------------------------------------------------- |
| `id`                | `string`                                   | Unique identifier.                                  |
| `layer`             | `"episodic" \| "semantic" \| "procedural"` | Memory layer.                                       |
| `content`           | `string`                                   | Memory text. Non-empty.                             |
| `summary`           | `string \| null`                           | Summary text.                                       |
| `accessCount`       | `number`                                   | Non-negative integer.                               |
| `lastAccessedAt`    | `string \| null`                           | ISO 8601.                                           |
| `tags`              | `string[]`                                 | Classification tags.                                |
| `metadata`          | `MemoryMetadata \| null`                   | Extensible metadata.                                |
| `createdAt`         | `string`                                   | ISO 8601.                                           |
| `updatedAt`         | `string \| null`                           | ISO 8601.                                           |
| `version`           | `number`                                   | Version number, starting at 1.                      |
| `supersedes`        | `string \| null`                           | ID of the previous version in the version chain.    |
| `validFrom`         | `string \| null`                           | ISO 8601 timestamp when this version became active. |
| `deprecated`        | `boolean`                                  | Soft-delete flag.                                   |
| `deprecationReason` | `string \| null`                           | Reason for deprecation.                             |

#### MemoryMetadata

An open, extensible object. Implementations MAY add fields. Defined fields:

| Field           | Type             | Description                                                           |
| --------------- | ---------------- | --------------------------------------------------------------------- |
| `source`        | `string \| null` | Origin of the memory (e.g., `"claude_code"`, `"cursor"`, `"manual"`). |
| `project`       | `string \| null` | Project identifier for memory scoping.                                |
| `sessionId`     | `string \| null` | Session identifier at creation time.                                  |
| `confidence`    | `number \| null` | Confidence score 0.0–1.0.                                             |
| `[key: string]` | `unknown`        | Any additional implementation-defined fields.                         |

#### RecallFilter

| Field           | Type       | Description                          |
| --------------- | ---------- | ------------------------------------ |
| `layer`         | `string`   | Filter by layer.                     |
| `tags`          | `string[]` | Filter by tags (AND semantics).      |
| `createdAfter`  | `string`   | ISO 8601 lower bound on `createdAt`. |
| `createdBefore` | `string`   | ISO 8601 upper bound on `createdAt`. |
| `memoryIds`     | `string[]` | Explicit list of IDs to retrieve.    |

---

### Error Handling

Implementations MUST return errors in the MCP tool error response format:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "MEMORY_NOT_FOUND: Memory entry with id='abc123' does not exist"
    }
  ]
}
```

Error message format: `<ERROR_CODE>: <human-readable description>` (RECOMMENDED).

Standard error codes:

| Code                       | HTTP Analog | Description                                  |
| -------------------------- | ----------- | -------------------------------------------- |
| `MEMORY_NOT_FOUND`         | 404         | Entry with the given ID does not exist.      |
| `INVALID_CONTENT`          | 400         | `content` is empty or null.                  |
| `INVALID_LAYER`            | 400         | `layer` value is not a defined identifier.   |
| `INVALID_PARAMETER`        | 400         | Other parameter validation failure.          |
| `VERSION_CONFLICT`         | 409         | Concurrent update collision.                 |
| `STORAGE_ERROR`            | 500         | Backend persistence failure.                 |
| `CAPABILITY_NOT_SUPPORTED` | 501         | Requested feature not implemented by server. |

---

### Versioning Protocol

When `update_memory` is called with `createVersion: true`, the following
operations MUST be performed atomically:

1. Set `deprecated: true` on the existing entry and record the update reason
   in `deprecationReason`.
2. Create a new entry with `supersedes` set to the old entry's ID.
3. Set `validFrom` on the new entry to the current ISO 8601 timestamp.
4. Set `version` on the new entry to `old.version + 1`.

Version chain example:

```
[Entry v1: id="a1", deprecated=true, supersedes=null]
        ^
[Entry v2: id="a2", deprecated=true, supersedes="a1"]
        ^
[Entry v3: id="a3", deprecated=false, supersedes="a2"]  ← current
```

### Point-in-Time Recall

When `asOf` is provided to `recall_memory` (requires capability
`temporal_query`), the implementation MUST return the version that was active
at the given timestamp using the following logic:

1. Select entries where `validFrom <= asOf`.
2. From those, include entries where `deprecated: true` but whose deprecation
   occurred after `asOf` (i.e., they were still active at `asOf`).
3. Always include entries where `deprecated: false` (subject to `validFrom`
   condition).
4. When multiple versions of the same chain match, return only the newest
   version that was valid at `asOf`.

---

### Capability Negotiation

#### Required Capabilities

All conforming implementations MUST support:

- `store_memory`
- `recall_memory` (without `asOf` or `includeVersionHistory`)
- `update_memory` with `createVersion: false` (in-place update)
- `forget_memory` (soft delete)

#### Optional Capabilities

| Capability        | Description                                      | Related Parameters                                                                 |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `versioning`      | Immutable version chains and history             | `update_memory(createVersion: true)`, `recall_memory(includeVersionHistory: true)` |
| `semantic_search` | Relevance-scored retrieval via vector similarity | `relevanceScore` in `RecalledMemory`                                               |
| `layer_promotion` | Automatic layer promotion by access frequency    | Internal; no API parameter                                                         |
| `temporal_query`  | Point-in-time recall                             | `recall_memory(asOf: ...)`                                                         |
| `ttl`             | Time-to-live expiration                          | `store_memory(ttl: ...)`                                                           |

Capability discovery is performed through MCP tool metadata. Implementations
MAY expose a supplementary `get_memory_capabilities` tool.

---

### Conformance Requirements

**MUST (required):**

- Implement all four core operations.
- Return `INVALID_CONTENT` when `content` is empty.
- Return `MEMORY_NOT_FOUND` when `update_memory` or `forget_memory` is called
  with a non-existent ID.
- Follow the error response format in Section "Error Handling".
- When declaring capability `versioning`, perform version chain
  INSERT/UPDATE atomically.
- When declaring capability `temporal_query`, implement point-in-time
  filtering exactly as specified.

**SHOULD (recommended):**

- Increment `accessCount` on each `recall_memory` execution.
- Use `<ERROR_CODE>: <description>` message format.
- Default `forget_memory` to soft delete.

**MAY (optional):**

- Implement any optional capabilities.
- Expose a `get_memory_capabilities` discovery tool.
- Support TTL-based automatic expiration with a soft-delete intermediate step.

---

## Rationale

### Why four operations?

The four operations (store / recall / update / forget) map directly to CRUD
semantics familiar to all developers. Alternative designs considered:

- **Single `memory` tool with an `action` parameter**: Rejected. MCP's
  `tools/list` is intended for clients to discover individual capabilities.
  Flattening everything into one tool hides the semantics from clients.
- **Resources instead of tools**: Rejected. MCP Resources are suited for
  content addressable by URI. Memory retrieval is inherently query-driven, not
  URI-driven.

### Why a three-layer model?

The episodic/semantic/procedural classification is grounded in cognitive
science and maps well to software development knowledge:

- Episodic: "I hit a null pointer bug in AuthService this morning."
- Semantic: "The AuthService uses lazy initialization."
- Procedural: "Always call `init()` before accessing AuthService."

Alternative: a flat priority field (1–10). Rejected because it pushes
categorization responsibility to clients, which typically lack the context
to assign numeric priority accurately.

### Why immutable version chains instead of in-place updates?

Developers frequently need to know what they believed at an earlier point in
time (e.g., "what was the API contract before the breaking change?"). In-place
updates destroy this history. Immutability is opt-in (`createVersion: true` is
the default but `false` is available for implementations that cannot afford the
storage overhead).

### Alternatives considered

- **Extending MCP Resources**: Resources lack mutation semantics (no update,
  no version chain). Adding memory operations to Resources would require
  defining new resource methods that go beyond the current spec.
- **A separate MCP primitive**: Introducing a `Memory` primitive alongside
  Resources and Tools was considered, but adds significant specification
  complexity. Tools are already extensible and widely supported by clients.

---

## Backward Compatibility

This proposal introduces new tools only. It does not modify existing MCP
message types, connection lifecycle, or resource/prompt semantics. Clients that
do not call memory tools are unaffected.

Servers that implement this proposal will advertise the new tools via
`tools/list`. Clients that do not understand memory tools will simply ignore
them.

---

## Security Implications

- **Sensitive data at rest**: Memory entries may contain proprietary code,
  credentials, or personal data. Implementations SHOULD encrypt entries at
  rest and offer project-scoped memory isolation via `metadata.project`.
- **Access control**: Implementations SHOULD prevent cross-project memory
  access. MCP's existing OAuth mechanisms MAY be combined with the memory
  server for user-level authentication.
- **Hard delete**: The `hard: true` deletion is irreversible. Implementations
  SHOULD record hard-delete operations in an audit log and MAY require
  explicit confirmation before executing.
- **TTL expiration**: Automatic deletion triggered by TTL expiration SHOULD be
  logged and SHOULD use soft delete before physical removal, to allow
  recovery within a grace period.

---

## Reference Implementation

A reference implementation is available at:
https://github.com/3062-in-zamud/knowledgine

Relevant packages:

| Package                            | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| `@knowledgine/mcp-memory-protocol` | TypeScript types, Zod schemas, and conformance test suite          |
| `@knowledgine/mcp-server`          | MCP server with all four core operations and optional capabilities |

See `docs/mcp-memory-protocol-proposal/reference-impl.md` and
`docs/mcp-memory-protocol-proposal/conformance-suite.md` in the Knowledgine
repository for usage guides.

---

## Acknowledgments

The three-layer memory model (episodic, semantic, procedural) is inspired by
Tulving's taxonomy of long-term memory systems.

Prior art reviewed:

- [Mem0](https://github.com/mem0ai/mem0) — user-level memory for AI agents
- [Zep](https://github.com/getzep/zep) / [Graphiti](https://github.com/getzep/graphiti) — temporal knowledge graph memory
- [Basic Memory](https://github.com/basicmachines-co/basic-memory) — local Markdown-based MCP memory server
- [MCP Memory Service](https://github.com/doobidoo/mcp-memory-service) — ChromaDB-backed semantic memory

None of these define an interoperable interface; each is a standalone
implementation. This SEP aims to define the interface so that implementations
like these can be swapped without client changes.
