import { getCoreRules } from "./core-rules.js";

/**
 * Template for Windsurf (.windsurf/rules/knowledgine.md) - create-file strategy.
 * Plain markdown (no MDC frontmatter). Keep under 6000 chars (Windsurf limit).
 */
export function getTemplate(_projectRoot: string): string {
  return `# knowledgine Integration

${getCoreRules()}

### MCP Tools (Windsurf)

| Tool | Parameters | Purpose |
|------|-----------|---------|
| \`search_knowledge\` | \`query\`, \`mode\`, \`limit\` | Search past knowledge |
| \`capture_knowledge\` | \`content\`, \`title\`, \`tags\`, \`source\` | Save new knowledge |
| \`find_related\` | \`noteId\`, \`filePath\`, \`limit\`, \`maxHops\` | Find related notes |
| \`search_entities\` | \`query\`, \`limit\` | Search named entities |
| \`get_entity_graph\` | \`entityId\`, \`entityName\` | Explore entity relationships |
| \`get_stats\` | _(none)_ | Show knowledge base stats |
| \`report_extraction_error\` | \`entityName\`, \`errorType\`, \`entityType\`, \`correctType\`, \`noteId\`, \`details\` | Report extraction errors |
`;
}
