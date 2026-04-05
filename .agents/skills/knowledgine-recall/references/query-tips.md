# Query Tips

How to formulate effective search queries for different situations.

---

## General Principles

1. **Specificity wins** — Specific queries outperform vague ones
   - Bad: `"error"`
   - Good: `"TypeError cannot read properties of undefined"`

2. **Use nouns and identifiers** — Verbs and adjectives add noise
   - Bad: `"how to fix the broken thing when null"`
   - Good: `"null check repository getById"`

3. **Error messages are gold** — Paste them verbatim for keyword mode

4. **Concepts use natural language** — For semantic mode, describe the situation
   - `"what approach did we use for caching database results"`

---

## Query Templates by Situation

### Error Message

```
// Paste the exact error message
keyword: "<exact error text>"

// If too long, use the unique part
keyword: "SQLITE_CONSTRAINT UNIQUE"
```

### File or Component

```
keyword: "<filename without extension>"
keyword: "<ClassName> OR <functionName>"
```

### Design Topic

```
semantic: "<component> architecture decision"
keyword: "design-decision <topic>"
```

### Past Problem

```
semantic: "<symptom description in plain language>"
hybrid: "<technology> <problem noun>"
```

### Pattern Search

```
keyword: "pattern <concept>"
semantic: "reusable pattern for <problem type>"
```

---

## When First Query Returns Nothing

Try these fallback strategies in order:

1. **Broaden the query** — Remove specific identifiers, keep nouns
   - `"SQLITE_ERROR: table notes has no column 'embedding'"`
   - → `"sqlite migration column"`

2. **Switch modes** — If keyword failed, try semantic and vice versa

3. **Synonym query** — Use related terms
   - `"authentication"` → `"auth session token login"`

4. **Tag-based query** — Search by tag category
   - `"bug-fix typescript"`
   - `"design-decision database"`

5. **Accept no results** — Not every problem has been captured before.
   After solving it, use knowledgine-capture to record the solution.

---

## Limit Guidance

| Situation                  | Recommended limit |
| -------------------------- | ----------------- |
| Quick lookup (known topic) | 3–5               |
| General exploration        | 10 (default)      |
| Building full context      | 15–20             |
| Finding rare entries       | 20+               |

Higher limits slow down search marginally; prefer lower limits when query is precise.
