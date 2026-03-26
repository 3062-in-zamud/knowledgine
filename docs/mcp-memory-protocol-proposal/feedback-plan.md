# Feedback Response Plan

This document anticipates likely community feedback on the Memory Protocol SEP
and outlines response strategies and timelines.

---

## Anticipated Feedback

### 1. "This belongs in MCP as a Resource, not Tools"

**Likely from:** Core MCP contributors familiar with Resources.

**Our position:** Memory retrieval is query-driven, not URI-addressable. The
canonical use case — "recall what I know about X" — is a function call, not a
resource fetch. Resources are well-suited for content with stable, predictable
URIs (files, database rows by primary key). Memory entries are discovered
through search, which is naturally a tool operation.

**If challenged strongly:** Propose a hybrid — a `memory://` URI scheme for
direct ID-based access (as a Resource) alongside the four tool operations for
query-based interaction. This is additive and does not require changing the
core proposal.

---

### 2. "The three-layer model is too opinionated / not general enough"

**Likely from:** Developers building non-developer memory systems (customer
support, general assistants).

**Our position:** The three layers are intentionally modeled on developer
knowledge patterns, which is the primary use case this proposal targets. The
layers are identifiers, not a strict taxonomy — implementations may map them
to their own internal classifications. Alternative designs (flat priority 1–N,
arbitrary categories) push the categorization decision to clients, which
typically lack context to make it correctly.

**Possible concession:** Add an OPTIONAL `category` string field to
`MemoryMetadata` for implementations that need more granular classification
without requiring all implementations to support it.

---

### 3. "Why are version chains opt-in? All writes should be append-only."

**Likely from:** Developers with event-sourcing backgrounds.

**Our position:** Append-only storage has real costs — storage growth,
query complexity, migration burden. Making versioning a declared capability
(`versioning`) allows simple implementations (local CLI tools, prototypes) to
start without version overhead and upgrade incrementally. The default for
`createVersion` is `true` so that users of capable servers get history by
default.

**If strong consensus for append-only as default:** Elevate `versioning` to a
SHOULD-level requirement (strongly recommended but not MUST). This keeps the
door open for minimal implementations.

---

### 4. "Capability discovery is underspecified — how does a client know what a server supports?"

**Likely from:** Client SDK authors.

**Our position:** The current proposal defers capability advertisement to MCP
tool metadata, which is intentionally minimal. We recognize this is
underspecified for programmatic use.

**Prepared response:** Propose adding a RECOMMENDED `memory/capabilities`
endpoint (as an MCP tool or as a structured field in the server's
`initialize` response) that returns a structured list of supported
capabilities. This is a small, additive change to the draft.

---

### 5. "The `metadata` object is too open-ended — implementations will diverge."

**Likely from:** Interoperability advocates.

**Our position:** The `metadata` object defines a set of common fields
(`source`, `project`, `sessionId`, `confidence`) and allows extension. This
is the same pattern as HTTP headers or JSON-LD context — a shared vocabulary
with room for extensions. Mandating all fields would make the spec harder to
implement and would add noise for use cases that don't need them.

**Possible concession:** Mark the defined fields as RECOMMENDED (not just
defined) so conformance suites can test for their presence.

---

### 6. "How does this interact with MCP sampling / LLM-side context injection?"

**Likely from:** Anthropic team or MCP power users.

**Our position:** This proposal is intentionally scoped to the server-side
memory storage and retrieval interface. How a client injects recalled memories
into LLM context (via system prompt, tool result, etc.) is out of scope and
left to client implementations. We can add a non-normative section to the SEP
explaining common patterns.

---

### 7. "Why `forget_memory` instead of `delete_memory`?"

**Likely from:** Developers who prefer standard CRUD terminology.

**Our position:** "Forget" is intentional — it emphasizes that the primary
operation is soft deletion (marking as deprecated), not physical removal.
`delete` implies irreversibility, which conflicts with the default soft-forget
behavior. This is a naming preference; if the MCP community strongly prefers
`delete_memory`, renaming is trivial.

---

## Submission and Response Timeline

| Date               | Action                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| 2026-03-26         | Internal review complete; proposal documents finalized                                   |
| Week of 2026-03-31 | Open GitHub Discussion in modelcontextprotocol/modelcontextprotocol to validate interest |
| Week of 2026-04-07 | Collect initial reactions; revise SEP draft based on feedback                            |
| Week of 2026-04-14 | Submit PR with `seps/<number>-memory-protocol.md`; disclose AI assistance                |
| Ongoing            | Respond to PR review comments within 48 hours                                            |
| TBD                | Seek sponsor from MCP maintainer team                                                    |

---

## Disclosure Note

When submitting the PR, we will include the following disclosure as required
by the CONTRIBUTING.md:

> This SEP was drafted with AI assistance (Claude). The Knowledgine team
> reviewed, revised, and takes responsibility for all technical decisions
> and claims in the proposal.
