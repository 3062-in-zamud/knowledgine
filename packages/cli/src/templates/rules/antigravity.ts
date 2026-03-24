import { getCoreRules } from "./core-rules.js";

/**
 * Template for Antigravity (AGENTS.md) - append-section strategy.
 * Shares AGENTS.md with Codex and OpenCode. Same markers.
 */
export function getTemplate(_projectRoot: string): string {
  return `<!-- knowledgine:rules:start -->
${getCoreRules()}

### CLI Commands (Antigravity)

\`\`\`bash
knowledgine recall "<query>"                       # Search knowledge
knowledgine capture add "<content>" --tags "<tag>" # Save knowledge
\`\`\`

### MCP Tools (Antigravity)

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
