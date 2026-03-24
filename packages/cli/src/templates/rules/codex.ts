import { getCoreRules } from "./core-rules.js";

/**
 * Template for Codex CLI (AGENTS.md) - append-section strategy.
 * Wrapped in knowledgine markers. Uses $skill-name references and CLI commands.
 */
export function getTemplate(_projectRoot: string): string {
  return `<!-- knowledgine:rules:start -->
${getCoreRules()}

### CLI Commands (Codex)

\`\`\`bash
knowledgine recall "<query>"                       # Search knowledge
knowledgine capture add "<content>" --tags "<tag>" # Save knowledge
\`\`\`

### Skills

- \`$knowledgine-capture\` — Save knowledge from the current session
- \`$knowledgine-recall\` — Search for relevant past knowledge
- \`$knowledgine-suggest\` — Get suggestions based on current context
- \`$knowledgine-debrief\` — Summarize and record session learnings

### MCP Tools (Codex)

| Tool | Parameters | Purpose |
|------|-----------|---------|
| \`search_knowledge\` | \`query\`, \`mode\`, \`limit\` | Search past knowledge |
| \`capture_knowledge\` | \`content\`, \`title\`, \`tags\`, \`source\` | Save new knowledge |
| \`find_related\` | \`noteId\`, \`filePath\`, \`limit\`, \`maxHops\` | Find related notes |
| \`search_entities\` | \`query\`, \`limit\` | Search named entities |
| \`get_entity_graph\` | \`entityId\`, \`entityName\` | Explore entity relationships |
| \`get_stats\` | _(none)_ | Show knowledge base stats |
| \`report_extraction_error\` | \`entityName\`, \`errorType\`, \`entityType\`, \`correctType\`, \`noteId\`, \`details\` | Report extraction errors |
<!-- knowledgine:rules:end -->`;
}
