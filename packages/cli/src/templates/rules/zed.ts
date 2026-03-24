import { getCoreRules } from "./core-rules.js";

/**
 * Template for Zed (.rules) - create-file strategy.
 * Plain markdown. References context_servers (Zed's MCP key).
 */
export function getTemplate(_projectRoot: string): string {
  return `# knowledgine Integration

${getCoreRules()}

### MCP Tools (Zed)

knowledgine is available via Zed's \`context_servers\` configuration.
Use these tools in the assistant panel:

| Tool | Parameters | Purpose |
|------|-----------|---------|
| \`search_knowledge\` | \`query\`, \`mode\`, \`limit\` | Search past knowledge |
| \`capture_knowledge\` | \`content\`, \`title\`, \`tags\`, \`source\` | Save new knowledge |
| \`find_related\` | \`noteId\`, \`filePath\`, \`limit\`, \`maxHops\` | Find related notes |
| \`search_entities\` | \`query\`, \`limit\` | Search named entities |
| \`get_entity_graph\` | \`entityId\`, \`entityName\` | Explore entity relationships |
| \`get_stats\` | _(none)_ | Show knowledge base stats |
| \`report_extraction_error\` | \`entityName\`, \`errorType\`, \`entityType\`, \`correctType\`, \`noteId\`, \`details\` | Report extraction errors |

### CLI Commands (Zed)

\`\`\`bash
knowledgine recall "<query>"                       # Search knowledge
knowledgine capture add "<content>" --tags "<tag>" # Save knowledge
\`\`\`
`;
}
