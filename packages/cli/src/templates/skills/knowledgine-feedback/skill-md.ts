export const SKILL_MD = `---
name: knowledgine-feedback
version: "1.0.0"
lang: en
description: >
  Report incorrect, missing, or misclassified entity extractions to improve knowledge
  base quality. Invoke when you notice an entity that should not exist (false positive),
  an entity assigned to the wrong type (wrong_type), or a real entity that was not
  extracted at all (missed_entity).
---
# knowledgine-feedback

## Purpose

Improve the quality of automatic entity extraction by reporting errors. Feedback is
stored and can be applied to update extraction rules, preventing the same errors from
recurring in future ingests.

## When to Use

- **False positive detected** — An entity was extracted that is not actually a named entity
  (e.g., a common English word extracted as a "technology" entity)
- **Wrong type detected** — An entity exists but is classified incorrectly
  (e.g., "TypeScript" classified as "person" instead of "technology")
- **Missed entity detected** — An important entity was not extracted at all
  (e.g., a library name that appears frequently but has no entity record)

## When NOT to Use

- When entity extraction quality is acceptable — minor imprecision is normal
- For subjective disagreements about entity importance (not extracting an entity
  does not always mean it was missed — the extractor uses confidence thresholds)

## How to Report (MCP Tool)

Use the \`report_extraction_error\` MCP tool:

\`\`\`
report_extraction_error(
  entityName: string,      // The entity name as it appears in the note
  errorType: "false_positive" | "wrong_type" | "missed_entity",
  entityType?: string,     // Current entity type (for wrong_type and false_positive)
  correctType?: string,    // What the type should be (for wrong_type)
  noteId?: number,         // ID of the note where the issue was observed
  details?: string         // Additional context about the error
)
\`\`\`

## How to Report (CLI Alternative)

\`\`\`bash
# Report a false positive
knowledgine feedback report \
  --entity "the" \
  --type false_positive \
  --entity-type concept \
  --details "Common English article incorrectly extracted as entity"

# Report wrong type
knowledgine feedback report \
  --entity "TypeScript" \
  --type wrong_type \
  --entity-type person \
  --correct-type technology

# Report missed entity
knowledgine feedback report \
  --entity "Zod" \
  --type missed_entity \
  --details "Validation library used throughout packages/core but not extracted"
\`\`\`

## Step-by-Step Instructions

1. **Identify the error type** — Is it a false positive, wrong type, or missed entity?
2. **Find the entity name** — Use \`search_entities\` to find the exact stored name if it exists
3. **Note the note ID** — If you observed the error in a specific note, record its ID
4. **Call report_extraction_error** — Include all applicable parameters
5. **Verify submission** — Confirm the tool returned a success response

## Managing Feedback

\`\`\`bash
# View pending feedback
knowledgine feedback list --status pending

# Apply a specific feedback report (admin operation)
knowledgine feedback apply <id>

# Dismiss feedback without applying
knowledgine feedback dismiss <id>

# View feedback statistics
knowledgine feedback stats
\`\`\`

## Best Practices

- Report high-frequency errors first — they have the most impact
- Include specific details about what makes the extraction incorrect
- Reference a note ID when possible so the error can be verified in context
- Do not report minor cases that have no practical impact on search quality

## Reference Files

- See \`error-types.md\` for detailed descriptions and examples of each error type
- See \`feedback-guide.md\` for how to write effective feedback reports
`;
