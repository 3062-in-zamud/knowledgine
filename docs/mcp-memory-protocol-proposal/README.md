# MCP Memory Protocol Extension Proposal

This directory contains the draft proposal for a standardized memory management
interface for MCP servers, to be submitted to the
[modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol)
repository via the SEP (Specification Enhancement Proposal) process.

## Summary

Standardized memory management interface for MCP servers, enabling persistent
memory across AI assistant sessions.

## Motivation

- **LLMs are stateless.** Context is lost between sessions. Developers must
  re-explain project conventions, past decisions, and debugging lessons every
  time a new session starts.
- **Developer memory is specialized.** Code knowledge, debugging experience,
  and design decisions require a memory model distinct from generic user data —
  one that handles updates, obsolescence, and procedural knowledge.
- **No interoperability today.** Claude Code, Cursor, Windsurf, and similar
  tools each implement their own memory systems. Switching tools means losing
  all accumulated context. Existing open-source solutions (Mem0, Zep, Basic
  Memory) are not interoperable with each other.

## Proposal

Four core operations:

| Operation       | Description                                   |
| --------------- | --------------------------------------------- |
| `store_memory`  | Persist a new memory entry                    |
| `recall_memory` | Retrieve entries by query or filter           |
| `update_memory` | Update an entry (with optional version chain) |
| `forget_memory` | Soft-delete or hard-delete an entry           |

Three-layer memory model:

| Layer        | Concept    | Characteristics                                          |
| ------------ | ---------- | -------------------------------------------------------- |
| `episodic`   | Short-term | Recent events; fades if rarely accessed                  |
| `semantic`   | Mid-term   | Repeatedly accessed knowledge; conceptual understanding  |
| `procedural` | Long-term  | Coding patterns, design principles, established know-how |

Additional features via optional capabilities:

- **Version chains** — immutable update history with point-in-time recall
- **Semantic search** — relevance scoring via vector similarity
- **Layer promotion** — automatic promotion based on access frequency
- **TTL** — time-to-live expiration for ephemeral entries

## Reference Implementation

- Specification package: `@knowledgine/mcp-memory-protocol` (types + conformance suite)
- Server: `@knowledgine/mcp-server` (reference implementation)
- Repository: https://github.com/3062-in-zamud/knowledgine

## Files in This Directory

| File                   | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `README.md`            | This overview                                               |
| `sep-draft.md`         | Full SEP document in modelcontextprotocol SEP format        |
| `reference-impl.md`    | Guide to the reference implementation and conformance suite |
| `conformance-suite.md` | How to run the conformance test suite                       |
| `feedback-plan.md`     | Anticipated community feedback and response plan            |

## Status

Draft — seeking community feedback before formal SEP submission.

## Submission Plan

The proposal will be submitted following the SEP process described at
https://modelcontextprotocol.io/community/sep-guidelines:

1. Open a GitHub Discussion in modelcontextprotocol/modelcontextprotocol to
   validate community interest
2. Build on feedback, revise the SEP draft
3. Submit a PR adding `seps/<number>-memory-protocol.md`
4. Seek a sponsor from the MCP maintainer team

**Note:** AI assistance (Claude) was used to draft these documents and will be
disclosed in the PR submission.
