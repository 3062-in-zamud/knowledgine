---
tags:
  - api
  - rest
  - design
author: demo-user
project: backend-api
---

# REST API Design Decisions

## Issue: Pagination Strategy

Needed to decide between offset-based and cursor-based pagination
for the search results endpoint.

### Decision: Cursor-based pagination

Offset pagination breaks when items are inserted/deleted during browsing.

```typescript
// Cursor-based pagination
interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null; // null means no more pages
  hasMore: boolean;
}

app.get("/api/notes", (req, res) => {
  const { cursor, limit = 20 } = req.query;
  const decoded = cursor ? decodeCursor(cursor) : null;

  const notes = db.query(
    `SELECT * FROM notes
     WHERE ($1::text IS NULL OR id < $1)
     ORDER BY id DESC LIMIT $2`,
    [decoded?.id, limit + 1],
  );

  const hasMore = notes.length > limit;
  const data = notes.slice(0, limit);

  res.json({
    data,
    cursor: hasMore ? encodeCursor(data.at(-1)) : null,
    hasMore,
  });
});
```

## Issue: Error Response Format

Standardized error responses across all endpoints.

### Solution: RFC 7807 Problem Details

```typescript
interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

// Error handler middleware
app.use((err, req, res, _next) => {
  const problem: ProblemDetail = {
    type: `https://api.example.com/errors/${err.code}`,
    title: err.title || "Internal Server Error",
    status: err.status || 500,
    detail: err.message,
    instance: req.originalUrl,
  };
  res.status(problem.status).json(problem);
});
```

## Learnings

- Cursor-based pagination is more reliable for real-time data
- Consistent error formats reduce client-side error handling complexity
- Always version your API from the start (`/v1/`)
- Document decisions in ADRs for future team members
