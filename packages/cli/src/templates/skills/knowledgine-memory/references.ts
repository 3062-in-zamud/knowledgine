export const REFERENCES: Record<string, string> = {
  "layer-guide.md": `# Memory Layer Guide

Detailed guidance for choosing, using, and promoting across the three memory layers.

---

## episodic — Short-Term Session Context

**Core question**: "What am I doing right now?"

**Lifespan**: Hours to days. Expires naturally when the session or task ends.

**Examples**:
- "Currently refactoring the auth module — halfway through extracting token validation. Next step: update callers in routes/protected.ts."
- "Debugging a race condition in the job queue. Hypothesis: worker is processing items before the DB write commits. Still investigating."
- "Session goal: get the failing integration tests green before end of day. Blocked on fixture setup."
- "Opened 3 PRs this session: #42 (auth), #43 (cache), #44 (types). All awaiting review."

**Recommended TTL values**:
| Duration | Seconds | Use case |
|----------|---------|----------|
| 1 hour | 3600 | Within-session scratchpad |
| 1 day | 86400 | Resume tomorrow |
| 1 week | 604800 | Ongoing task spanning days |
| None | — | Only if you want manual cleanup |

**When to promote to semantic**:
Promote an episodic memory to semantic when:
- The same context has been recreated in 2+ separate sessions
- The information represents a fact or decision, not just current state
- The TTL would expire before the context is no longer relevant

**Tagging strategy**:
Use status tags and time-bound identifiers: \`in-progress\`, \`blocked\`, \`session-goal\`, and a project/task identifier. Example: \`["auth-refactor", "in-progress", "session-2024-01-20"]\`

---

## semantic — Mid-Term Facts and Decisions

**Core question**: "What did I learn this week?"

**Lifespan**: Days to weeks. Represents stable facts, decisions, or context that outlives a single session but is not yet a permanent skill.

**Examples**:
- "The payments team decided to defer Stripe migration to Q3. All payment-related work should target the existing Braintree integration until then."
- "The staging database does not auto-reset between test runs. Always run the seed script manually before integration tests."
- "The \`user_sessions\` table has no index on \`expires_at\`. Queries filtering by expiry are slow on the staging dataset (800k rows). Ticket filed: INFRA-1042."
- "Team convention: feature flags are managed in \`config/flags.ts\` — do not use environment variables directly for feature gating."

**When to promote to procedural**:
Promote a semantic memory to procedural when:
- The same pattern or workflow has been applied successfully in 3+ distinct situations
- The knowledge represents a generalizable skill, not a project-specific fact
- You want it available as a default starting point in any new project context

**Tagging strategy**:
Use domain and status tags: \`decision\`, \`constraint\`, \`team-convention\`, \`project-fact\`, plus the relevant technical area. Example: \`["payments", "decision", "q3-deferral"]\`

---

## procedural — Long-Term Patterns and Skills

**Core question**: "How do I solve this type of problem?"

**Lifespan**: Weeks to indefinite. Represents stable, generalizable skills and workflows.

**Examples**:
- "Debugging race conditions in async job queues: (1) Add per-operation trace IDs, (2) Log queue state before and after dequeue, (3) Check for missing await on DB writes, (4) Use a single-worker test mode to eliminate concurrency."
- "Code review checklist for auth changes: verify token expiry handling, confirm CSRF protection is not bypassed, check for missing rate limiting on login endpoints, confirm secrets are not logged."
- "Deployment procedure for database migrations: (1) Run migration in dry-run mode against staging, (2) Verify row counts and index creation, (3) Take a snapshot, (4) Apply to production during low-traffic window, (5) Monitor error rate for 30 minutes."
- "When TypeScript reports 'object is possibly undefined' in a call chain, prefer adding a guard clause at the function entry point rather than using non-null assertions. Non-null assertions suppress the error without fixing it."

**Tagging strategy**:
Use skill-category and domain tags: \`workflow\`, \`checklist\`, \`pattern\`, \`debugging\`, \`deployment\`, \`code-review\`, plus the technical area. Example: \`["debugging", "async", "workflow"]\`

---

## Layer Promotion Workflow

\`\`\`
episodic
   │
   │  After 2+ sessions recreating the same context
   │  OR context represents a stable fact/decision
   ▼
semantic
   │
   │  After 3+ successful applications in distinct situations
   │  OR knowledge is clearly generalizable beyond this project
   ▼
procedural
\`\`\`

**Promotion steps**:
1. Recall the existing entry by ID or tag filter
2. Call \`store_memory\` with the promoted layer and refined content (distill to the essential pattern)
3. Call \`forget_memory\` on the original entry with reason "Promoted to [layer]"
4. Update tags to reflect the new layer's conventions

---

## Tagging Strategy Summary

| Layer | Recommended tag patterns | Examples |
|-------|--------------------------|---------|
| episodic | status + task identifier | \`in-progress\`, \`blocked\`, \`session-goal\` |
| semantic | domain + fact type | \`decision\`, \`constraint\`, \`team-convention\` |
| procedural | skill category + domain | \`workflow\`, \`checklist\`, \`pattern\`, \`debugging\` |

Keep tags specific enough to be meaningful as filters, but not so specific that they are
unique to a single entry. Aim for 2–4 tags per entry.
`,

  "memory-vs-knowledge.md": `# Memory vs Knowledge: Decision Matrix

Use this guide to decide whether to call \`store_memory\` (memory tools) or
\`capture_knowledge\` (knowledgine-capture skill).

---

## Decision Matrix

| Criterion | Memory (\`store_memory\`) | Knowledge (\`capture_knowledge\`) |
|-----------|--------------------------|----------------------------------|
| **Lifespan** | Temporary to mid-term | Permanent |
| **Audience** | Same user or agent instance | Team-wide |
| **Content type** | State, context, in-progress work | Solutions, decisions, reusable patterns |
| **Search method** | Layer, tags, date range | Full-text, semantic, graph |
| **Examples** | "Working on auth refactor, blocked on token refresh" | "Fixed auth bug by adding token refresh before expiry check" |
| **Versioning** | Optional (\`createVersion\` flag) | Automatic (note history always kept) |
| **Expiration** | TTL support | No expiration |
| **Trigger** | Any time during a session | After completing work with transferable insight |

---

## Quick Decision Tree

\`\`\`
Is this information useful only to me (or the current agent) for current/near-future work?
├── YES → Is it likely to expire soon or when the task ends?
│         ├── YES → store_memory (episodic, set TTL)
│         └── NO  → store_memory (semantic or procedural)
└── NO  → Is it a fact, decision, pattern, or solution others could learn from?
          ├── YES → capture_knowledge (knowledgine-capture)
          └── NO  → Does not need to be stored
\`\`\`

---

## Examples by Scenario

### Use store_memory

- "I am halfway through migrating the user service to the new API. Next session, start at routes/users.ts line 142."
  → episodic, TTL: 86400

- "The staging environment is currently broken due to a failed migration. Do not run integration tests against staging until INFRA-204 is resolved."
  → semantic, no TTL (remove manually when resolved)

- "Pattern I always use when debugging flaky tests: isolate with --runInBand, add verbose logging, check for shared state in beforeEach."
  → procedural, no TTL

### Use capture_knowledge

- "Fixed the flaky test: root cause was a shared in-memory cache not reset between tests. Fix: call cache.clear() in afterEach."
  → This is a solved problem with a transferable root cause — use capture_knowledge

- "Decision: use optimistic locking for the inventory update endpoint to prevent overselling. Alternative (pessimistic locking) was rejected due to latency."
  → This is a design decision with reasoning that benefits the whole team — use capture_knowledge

- "Pattern: use guard clauses at function entry rather than nested if/else to reduce cyclomatic complexity."
  → This is a reusable code pattern — use capture_knowledge

---

## When Both Apply

Sometimes the same session produces both a memory entry and a knowledge capture:

1. **During work**: Store an episodic memory tracking progress and open questions
2. **After completing work**: Capture the insight (bug fix, decision, pattern) in knowledgine-capture
3. **Clean up**: Delete the episodic memory with \`forget_memory\` (reason: "Task complete — captured in knowledge base")

This separation keeps the memory store focused on actionable state while the knowledge
base accumulates durable insights.
`,
};
