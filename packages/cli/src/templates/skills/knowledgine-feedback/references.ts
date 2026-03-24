export const REFERENCES: Record<string, string> = {
  "error-types.md": `# Error Types

Descriptions and examples of the three entity extraction error types.

---

## false_positive

**Definition**: An entity was extracted that is not actually a meaningful named entity.
The extraction system incorrectly identified a word or phrase as a significant entity.

**Common causes**:
- Common English words extracted as entity types (e.g., "Map" as technology)
- Context-specific jargon that is not a real entity (e.g., "Result" as a concept)
- Partial matches of entity names (e.g., "Type" extracted from "TypeScript")

**Examples**:

| Entity | Extracted Type | Why it's wrong |
|--------|---------------|----------------|
| "the" | concept | Common article, not an entity |
| "Manager" | technology | Generic class name suffix, not a product |
| "Error" | technology | Common programming term, not a specific tool |
| "Result" | concept | Generic programming term, used everywhere |

**When to report**:
Report when the false entity appears frequently in search results and reduces result
quality. A single occurrence in one obscure note may not be worth reporting.

**How to report**:
\`\`\`
report_extraction_error(
  entityName: "Manager",
  errorType: "false_positive",
  entityType: "technology",
  details: "Generic class name suffix, not a specific technology product"
)
\`\`\`

---

## wrong_type

**Definition**: A real, meaningful entity was extracted but assigned to the wrong type.
The entity exists and is valid, but it is categorized incorrectly.

**Common causes**:
- Technologies named like people (e.g., "Rust" could be confused with a surname)
- Concepts with technical names
- Projects or tools that share names with common words

**Examples**:

| Entity | Wrong Type | Correct Type | Reason |
|--------|-----------|--------------|--------|
| "TypeScript" | person | technology | A programming language, not a person |
| "Rust" | concept | technology | A programming language |
| "knowledgine" | concept | project | The name of this project |
| "Jest" | person | technology | A JavaScript testing framework |

**When to report**:
Report when wrong type classification causes the entity to appear in irrelevant searches
or prevents it from appearing in the correct entity type queries.

**How to report**:
\`\`\`
report_extraction_error(
  entityName: "TypeScript",
  errorType: "wrong_type",
  entityType: "person",
  correctType: "technology",
  details: "TypeScript is a programming language, not a person's name"
)
\`\`\`

---

## missed_entity

**Definition**: A significant entity was not extracted at all. The entity appears
in knowledge base notes but has no entity record in the graph.

**Common causes**:
- Entity extraction confidence threshold was too high for this entity
- Entity name was mentioned in an unusual format or context
- Entity is new and the extractor's model was not trained on it
- Entity appears in code blocks rather than prose

**Examples**:
- "Zod" mentioned throughout validation code but no entity extracted
- A team member's name that appears in commit messages but not in entity graph
- A specific error code (e.g., "SQLITE_CONSTRAINT_UNIQUE") that is referenced often
- A library name that only appears in import statements

**When to report**:
Report when an entity is important enough that you would use \`search_entities\` or
\`get_entity_graph\` to find it. Minor entities with low frequency may not be worth adding.

**How to report**:
\`\`\`
report_extraction_error(
  entityName: "Zod",
  errorType: "missed_entity",
  details: "Validation library used throughout packages/core for schema validation. \
Appears in imports and error messages but no entity was extracted."
)
\`\`\`
`,

  "feedback-guide.md": `# Feedback Guide

How to write effective feedback reports that lead to extraction improvements.

---

## What Makes Feedback Effective

Good feedback:
1. **Identifies the specific entity** — Exact name, not a description
2. **States the correct classification** — What type it should or should not be
3. **Explains why** — A brief rationale makes the feedback actionable
4. **References a note** — Links to where the issue was observed (when possible)

---

## Workflow for Reporting Feedback

### Step 1: Identify the issue

Use \`search_entities\` to find the entity in question:
\`\`\`
search_entities(query: "TypeScript", limit: 5)
\`\`\`

Check the returned type against what you expect.

### Step 2: Find a relevant note (optional but helpful)

If you saw the entity misclassified in a specific note, note its ID.
You can find note IDs in search_knowledge results.

### Step 3: Report

Call \`report_extraction_error\` with all available information:
\`\`\`
report_extraction_error(
  entityName: "<exact name>",
  errorType: "<false_positive|wrong_type|missed_entity>",
  entityType: "<current type if known>",
  correctType: "<correct type for wrong_type errors>",
  noteId: "<note id if available>",
  details: "<1–2 sentence explanation>"
)
\`\`\`

### Step 4: Verify submission

Confirm the tool returned a success response with a feedback ID.
Note the ID if you want to track the feedback status later.

---

## Writing the Details Field

The \`details\` field is the most important part of effective feedback. Include:

- What the entity actually is (if not obvious from its name)
- Why the extracted type is wrong
- How frequently the entity appears (if it is a missed entity)
- Any context that might help the extractor improve

**Weak details**:
\`\`\`
details: "wrong"
details: "this is not right"
\`\`\`

**Strong details**:
\`\`\`
details: "Zod is a TypeScript-first schema validation library. It appears in ~20 notes
under packages/core/src as imports and in error messages but was not extracted. It
should be classified as 'technology'."
\`\`\`

---

## Prioritizing What to Report

| Priority | Criteria |
|----------|----------|
| High | Entity appears in many notes; wrong type pollutes search results |
| High | Missed entity is central to the project domain |
| Medium | False positive appears often but does not cause significant harm |
| Low | Single-occurrence issue with minimal impact on search quality |

---

## After Reporting

Check feedback status and apply improvements:

\`\`\`bash
# List pending feedback
knowledgine feedback list --status pending

# View statistics on feedback quality
knowledgine feedback stats
\`\`\`

Applied feedback updates the extraction configuration so future ingests produce
better results. Dismissed feedback is recorded but no change is made.
`,
};
