/**
 * Core rules shared across all agent rule templates.
 * These instructions tell AI agents to proactively use knowledgine.
 */
export function getCoreRules(): string {
  return `## knowledgine (Local Knowledge Base)

This project uses knowledgine to accumulate and leverage development knowledge.
Autonomously perform the following during your session:

### Search (When facing problems)
- When encountering errors or bugs, search for past solutions first
- When considering implementation approaches, reference past design decisions
- Use search_knowledge MCP tool or \`knowledgine recall "<query>"\`

### Record (After solving / discovering)
Record to knowledgine whenever any of these events occur:
1. **Bug fix**: Root cause + solution as a pair
2. **Design decision**: Options considered + chosen approach + rationale
3. **Pattern discovery**: Reusable code pattern with context
4. **Troubleshooting**: Trial-and-error process + final resolution
5. **External knowledge**: Insights from docs, articles, Stack Overflow
6. **Refactoring**: Problem before + improvement made
- Use capture_knowledge MCP tool or \`knowledgine capture add "<content>" --tags "<category>"\`

### Debrief (Session completion)
- Summarize key learnings from the session and record them

### Quality (When noticing issues)
- Report entity extraction errors when you notice incorrect or missing entities
- Use report_extraction_error MCP tool`;
}
