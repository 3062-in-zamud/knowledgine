export const SKILL_MD = `---
name: knowledgine-memory
version: "1.0.0"
lang: en
description: >
  Manage cross-session memory for task state, context, and learned patterns. Invoke when
  you need to persist information across sessions that is not permanent knowledge — such
  as current task progress, session context, or procedural patterns learned during work.
  Distinct from knowledgine-capture which stores permanent, curated knowledge.
---
# knowledgine-memory

## Purpose

Manage session-scoped and cross-session state using the memory layer system. Memory entries
track what you are doing, where you left off, and how you solve recurring problems — without
polluting the permanent knowledge base with ephemeral context.

## When to Use

Use memory tools when any of the following apply:

1. **Task progress tracking** — You are mid-way through a multi-step task and want to resume in a future session
2. **Session context persistence** — You need to carry forward context (open questions, current hypotheses, blocking issues)
3. **Procedural pattern learning** — You discovered a repeatable workflow or debugging strategy worth reusing
4. **User preferences and working state** — Preferences, aliases, or workspace configuration learned during work
5. **Temporary notes with expiration** — Short-lived reminders or in-progress state that should expire automatically (use TTL)

## When NOT to Use

- **Permanent knowledge** → use \`knowledgine-capture\` (bug fixes, design decisions, reusable patterns)
- **Project documentation or source files** → use \`knowledgine-ingest\`
- **End-of-session summary** → use \`knowledgine-debrief\` (which may call store_memory internally)
- Facts or solutions you want to share team-wide → use \`knowledgine-capture\`

## Memory Layers

Choose the layer that matches the expected lifespan of the information:

| Layer | Lifespan | Question it answers | Recommended TTL |
|-------|----------|---------------------|-----------------|
| \`episodic\` | Hours to days | "What am I doing right now?" | 3600–86400s |
| \`semantic\` | Days to weeks | "What did I learn this week?" | 604800s or none |
| \`procedural\` | Weeks to permanent | "How do I solve this type of problem?" | None |

- **episodic** — Short-term session context. Use TTL to expire stale state automatically. Examples: current task description, in-progress debugging context, session goals.
- **semantic** — Mid-term facts and decisions relevant to an ongoing project phase. Examples: team decisions, project constraints, learned facts about a codebase section.
- **procedural** — Long-term patterns and repeatable skills. Promote from semantic when a pattern proves stable across multiple sessions. Examples: debugging workflows, code review checklists, deployment procedures.

See \`layer-guide.md\` for promotion workflow and per-layer tagging strategy.

## How to Use (MCP Tools)

### store_memory

Store a new memory entry.

\`\`\`
store_memory(
  content: string,                         // Memory content (required, non-empty)
  layer?: "episodic" | "semantic" | "procedural",  // Default: episodic
  tags?: string[],                         // Classification tags for recall filtering
  metadata?: {
    source?: string,                       // Origin (file, URL, tool name)
    project?: string,                      // Project scope
    sessionId?: string,                    // Session identifier
    confidence?: number,                   // 0–1 confidence score
  },
  ttl?: number,                            // Time-to-live in seconds (optional)
)
\`\`\`

### recall_memory

Retrieve memory entries by query, filter, or recency.

\`\`\`
recall_memory(
  query?: string,                          // Full-text search (omit for recent entries)
  filter?: {
    layer?: "episodic" | "semantic" | "procedural",
    tags?: string[],                       // AND filter — all tags must match
    createdAfter?: string,                 // ISO 8601 lower bound
    createdBefore?: string,               // ISO 8601 upper bound
    memoryIds?: string[],                  // Retrieve specific entries by ID
  },
  limit?: number,                          // Default: 10, max: 100
  includeVersionHistory?: boolean,         // Default: false
  asOf?: string,                           // ISO 8601 point-in-time query
)
\`\`\`

### update_memory

Update content, tags, or metadata of an existing entry. Creates a version snapshot by default.

\`\`\`
update_memory(
  id: string,                              // Memory entry ID (required)
  content?: string,                        // Replacement content
  summary?: string,                        // Replacement summary
  tags?: string[],                         // Replacement tags (full replace, not merge)
  metadata?: {                             // Partial metadata merge
    source?: string,
    project?: string,
    sessionId?: string,
    confidence?: number,
  },
  createVersion?: boolean,                 // Default: true (immutable version created)
)
\`\`\`

### forget_memory

Delete a memory entry. Soft delete by default (recoverable); hard delete removes data permanently.

\`\`\`
forget_memory(
  id: string,                              // Memory entry ID (required)
  reason?: string,                         // Deletion reason (written to audit log)
  hard?: boolean,                          // Default: false (soft delete)
)
\`\`\`

## Step-by-Step Instructions

### Storing a memory

1. **Choose the layer** — episodic for current task state, semantic for facts and decisions, procedural for repeatable patterns
2. **Write clear content** — Include enough context for you (or the agent) to act on the memory in a future session without re-investigation
3. **Set TTL for episodic entries** — 3600 (1 hour), 86400 (1 day), or 604800 (1 week) depending on expected relevance window
4. **Add tags** — Use 2–4 tags to enable efficient recall filtering (e.g., \`["auth", "in-progress", "session-2024-01"]\`)
5. **Call store_memory** — Pass content, layer, tags, and optional metadata/ttl
6. **Note the returned ID** — Store it if you will need to update or delete this entry later

### Recalling memories at session start

1. Call \`recall_memory\` with no arguments to get recent entries (default limit: 10)
2. Optionally filter by layer (\`episodic\`) to focus on current task state
3. If resuming a specific task, search by tags or project metadata
4. Review entries and discard expired or irrelevant ones with \`forget_memory\`

### Updating a memory

1. Retrieve the entry ID from a prior \`store_memory\` result or \`recall_memory\`
2. Call \`update_memory\` with the ID and changed fields
3. Leave \`createVersion: true\` (default) for important updates — this preserves the history
4. Use \`createVersion: false\` only for minor corrections (typos, formatting)

### Cleaning up

1. Call \`forget_memory\` with the entry ID when a task is complete
2. Provide a \`reason\` for audit clarity (e.g., \`"Task completed — captured in knowledgine-capture"\`)
3. Prefer soft delete (default) unless the entry contains data that must be physically removed

## Best Practices

- **Use TTL for episodic memories** — 3600 (1 hr) for within-session notes, 86400 (1 day) for next-day continuation, 604800 (1 week) for ongoing tasks
- **Tag for recall efficiency** — Tags are AND-filtered; use specific tags that uniquely identify the context (project name, task area, status)
- **Create versions for important updates** — The default \`createVersion: true\` creates an immutable audit trail; do not disable it for significant content changes
- **Prefer soft delete** — \`hard: false\` (default) keeps entries recoverable and maintains the audit log; use \`hard: true\` only when data must be physically purged
- **Promote across layers deliberately** — When an episodic memory proves useful across multiple sessions, re-store it as semantic; when a semantic pattern becomes a stable skill, promote to procedural

## Reference Files

- See \`layer-guide.md\` for detailed guidance on each layer with examples, TTL recommendations, and the layer promotion workflow
- See \`memory-vs-knowledge.md\` for a decision matrix comparing memory tools with knowledgine-capture
`;
