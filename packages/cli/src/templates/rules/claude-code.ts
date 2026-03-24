import { getCoreRules } from "./core-rules.js";

/**
 * Template for Claude Code (CLAUDE.md) - append-section strategy.
 * Wrapped in knowledgine markers so the section can be identified and updated.
 */
export function getTemplate(_projectRoot: string): string {
  return `<!-- knowledgine:rules:start -->
${getCoreRules()}

### MCP Tools (Claude Code)

Use these MCP tools directly in your session:

| Tool | Parameters | Purpose |
|------|-----------|---------|
| \`search_knowledge\` | \`query\`, \`mode\`, \`limit\` | Search past knowledge |
| \`capture_knowledge\` | \`content\`, \`title\`, \`tags\`, \`source\` | Save new knowledge |
| \`find_related\` | \`noteId\`, \`filePath\`, \`limit\`, \`maxHops\` | Find related notes |
| \`search_entities\` | \`query\`, \`limit\` | Search named entities |
| \`get_entity_graph\` | \`entityId\`, \`entityName\` | Explore entity relationships |
| \`get_stats\` | _(none)_ | Show knowledge base stats |
| \`report_extraction_error\` | \`entityName\`, \`errorType\`, \`entityType\`, \`correctType\`, \`noteId\`, \`details\` | Report extraction errors |

### Skills (Claude Code slash commands)

- \`/knowledgine-capture\` — Save knowledge from the current session
- \`/knowledgine-recall\` — Search for relevant past knowledge
- \`/knowledgine-suggest\` — Get suggestions based on current context
- \`/knowledgine-debrief\` — Summarize and record session learnings
<!-- knowledgine:rules:end -->`;
}
