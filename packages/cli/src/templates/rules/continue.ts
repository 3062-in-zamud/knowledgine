import { getCoreRules } from "./core-rules.js";

/**
 * Template for Continue.dev (.continuerules) - append-section strategy.
 * Wrapped in knowledgine markers. Plain text format (Continue uses raw text).
 */
export function getTemplate(_projectRoot: string): string {
  return `<!-- knowledgine:rules:start -->
${getCoreRules()}

### CLI Commands (Continue)

Use the knowledgine CLI for quick access:

  knowledgine recall "<query>"                       # Search knowledge
  knowledgine capture add "<content>" --tags "<tag>" # Save knowledge

### MCP Tools (Continue)

If the knowledgine MCP server is configured in your Continue settings,
use these tools directly:

  search_knowledge(query, mode?, limit?)             # Search past knowledge
  capture_knowledge(content, title?, tags?, source?) # Save new knowledge
  find_related(noteId?, filePath?, limit?, maxHops?) # Find related notes
  search_entities(query, limit?)                     # Search named entities
  get_entity_graph(entityId?, entityName?)           # Explore entity graph
  get_stats()                                        # Show knowledge base stats
  report_extraction_error(entityName, errorType, ...)# Report extraction errors
<!-- knowledgine:rules:end -->`;
}
