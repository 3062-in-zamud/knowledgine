import { getCoreRules } from "./core-rules.js";

/**
 * Template for GitHub Copilot (.github/copilot-instructions.md) - create-file strategy.
 * Plain markdown. Includes CLI commands and REST API endpoints.
 */
export function getTemplate(_projectRoot: string): string {
  return `# knowledgine Integration

${getCoreRules()}

### CLI Commands (GitHub Copilot)

\`\`\`bash
knowledgine recall "<query>"                       # Search knowledge
knowledgine capture add "<content>" --tags "<tag>" # Save knowledge
\`\`\`

### REST API

When the knowledgine server is running (\`knowledgine start\`), you can use the REST API:

\`\`\`
GET  http://localhost:3456/search?q=<query>         # Search knowledge
GET  http://localhost:3456/search?q=<query>&mode=semantic  # Semantic search
POST http://localhost:3456/capture                  # Save knowledge (JSON body)
GET  http://localhost:3456/stats                    # Show stats
\`\`\`

### MCP Tools (GitHub Copilot)

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
