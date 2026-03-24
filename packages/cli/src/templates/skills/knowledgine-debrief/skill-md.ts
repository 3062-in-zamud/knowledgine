export const SKILL_MD = `---
name: knowledgine-debrief
description: >
  Summarize and record all learnings from the current session at its end. Invoke when
  the user signals the session is complete, after finishing a major task, or when asked
  for a session review. Produces a structured knowledge capture covering problems solved,
  decisions made, patterns found, and open questions.
---
# knowledgine-debrief

## Purpose

Consolidate all learnings from the session into the knowledge base before context is
lost. A debrief transforms the raw events of a session — bugs fixed, decisions made,
code changed — into durable structured knowledge that future sessions can build on.

## When to Use

- **End of session** — User says "done", "that's all", "let's wrap up", or similar
- **After completing a major task** — Significant feature, complex bug fix, or refactoring
- **User requests a review** — "What did we do today?", "Summarize the session"
- **Before switching contexts** — Moving to a completely different area of the codebase

## When NOT to Use

- Mid-session after every small change — save debrief for meaningful milestones
- When nothing significant happened (trivial edits only)

## How to Debrief (MCP Tool)

Use \`capture_knowledge\` to save the session summary:

\`\`\`
capture_knowledge(
  content: string,    // Full structured debrief using the template
  title: string,      // "Session Debrief: <date> — <main topic>"
  tags: string[],     // ["debrief", "<primary-area>", ...]
  source?: string     // Optional: session identifier
)
\`\`\`

## Step-by-Step Instructions

1. **Recall the session** — Review what was worked on (rely on your context window)
2. **Identify key events** — Problems solved, decisions made, patterns found
3. **Draft the debrief** — Use the structured template from debrief-template.md
4. **Capture each major learning individually** — If a bug fix or decision is significant
   enough to stand alone, capture it separately with the appropriate skill first
5. **Capture the session summary** — Save the consolidated debrief note
6. **Confirm completion** — Report to the user what was captured

## Debrief Structure

A good debrief contains:

- **Problems Solved** — What broke and how it was fixed
- **Decisions Made** — What was chosen and why
- **Patterns Found** — Reusable insights discovered
- **Code Changed** — Summary of files modified and purpose
- **Open Questions** — Unresolved items for future sessions

## Best Practices

- Write for a future reader with no context from this session
- Be specific about what changed, not just what was done
- Open questions are as valuable as answers — document uncertainty
- If the session was long, do individual captures for major events before the summary

## Reference Files

- See \`debrief-template.md\` for the structured template to fill in
- See \`example-output.md\` for a concrete example of a well-written debrief
`;
