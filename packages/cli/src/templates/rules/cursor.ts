import { getCoreRules } from "./core-rules.js";

/**
 * Template for Cursor (.cursor/rules/knowledgine.mdc) - create-file strategy.
 * Uses MDC frontmatter with alwaysApply: true so the rule is always active.
 */
export function getTemplate(_projectRoot: string): string {
  return `---
description: knowledgine knowledge base integration - autonomous knowledge capture and recall
globs: **/*
alwaysApply: true
---
${getCoreRules()}

### MCP Tools (Cursor)

Use these MCP tools via the knowledgine MCP server:

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
