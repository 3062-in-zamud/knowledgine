---
tags:
  - code-review
  - best-practices
  - team
author: demo-user
project: team-process
---
# Code Review Guidelines and Common Issues

## Problem
Code reviews were inconsistent. Some PRs got rubber-stamped while
others received 50+ nitpick comments. Reviews took 2-3 days on average.

## Solution: Review Checklist

### What to Check
1. **Correctness**: Does the code do what the PR description says?
2. **Edge cases**: Null handling, empty arrays, boundary conditions
3. **Security**: Input validation, SQL injection, XSS
4. **Tests**: Are new behaviors covered? Are edge cases tested?
5. **Naming**: Do variable/function names convey intent?

### Common Issues Found in Reviews

#### Error handling gaps
```typescript
// Bad: swallows errors silently
try {
  await saveUser(data);
} catch {
  // ignore
}

// Good: handle or propagate with context
try {
  await saveUser(data);
} catch (error) {
  logger.error("Failed to save user", { userId: data.id, error });
  throw new ServiceError("User save failed", { cause: error });
}
```

#### Missing input validation
```typescript
// Bad: trusts external input
app.post("/api/users", (req, res) => {
  db.query("INSERT INTO users (name) VALUES ($1)", [req.body.name]);
});

// Good: validate before processing
app.post("/api/users", (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.length > 255) {
    return res.status(400).json({ error: "Invalid name" });
  }
  db.query("INSERT INTO users (name) VALUES ($1)", [name]);
});
```

## Process Improvements
- Max review turnaround: 4 hours for small PRs, 1 day for large
- Use "Request changes" only for blocking issues
- Prefix comments: `nit:`, `question:`, `suggestion:`, `blocking:`
- Author should self-review before requesting review

## Learnings
- Checklists reduce review inconsistency
- Small PRs (< 300 lines) get better reviews and faster merges
- Automate what you can (linting, formatting, type checking)
- Focus reviews on logic and design, not style
