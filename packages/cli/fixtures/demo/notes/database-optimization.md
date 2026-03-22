---
tags:
  - database
  - sql
  - performance
author: demo-user
project: backend-api
---

# SQL Query Optimization and Indexing

## Problem

The notes search endpoint was timing out with 100k+ rows.
Average query time was 4.2 seconds, causing user-visible latency.

### Slow Query

```sql
SELECT n.*, COUNT(p.id) as pattern_count
FROM notes n
LEFT JOIN patterns p ON p.note_id = n.id
WHERE n.content LIKE '%typescript%'
  AND n.created_at > '2024-01-01'
GROUP BY n.id
ORDER BY n.created_at DESC
LIMIT 20;
```

## Investigation

Used `EXPLAIN ANALYZE` to identify bottlenecks:

```sql
EXPLAIN ANALYZE SELECT ...;
-- Seq Scan on notes  (cost=0.00..12847.00 rows=100234 width=412)
-- Filter: (content ~~ '%typescript%')
-- Rows Removed by Filter: 95102
```

The sequential scan was reading every row.

## Solution: Indexing Strategy

```sql
-- 1. B-tree index for date range queries
CREATE INDEX idx_notes_created_at ON notes (created_at DESC);

-- 2. Full-text search index instead of LIKE
CREATE INDEX idx_notes_content_fts ON notes
  USING GIN (to_tsvector('english', content));

-- 3. Covering index for the common query pattern
CREATE INDEX idx_patterns_note_id ON patterns (note_id);
```

### Rewritten Query

```sql
SELECT n.*, COUNT(p.id) as pattern_count
FROM notes n
LEFT JOIN patterns p ON p.note_id = n.id
WHERE to_tsvector('english', n.content) @@ plainto_tsquery('typescript')
  AND n.created_at > '2024-01-01'
GROUP BY n.id
ORDER BY n.created_at DESC
LIMIT 20;
```

## Results

- Query time: 4.2s → 18ms (233x improvement)
- Index storage overhead: ~45MB (acceptable for 100k rows)

## Learnings

- `LIKE '%term%'` cannot use indexes — always use full-text search
- `EXPLAIN ANALYZE` is the first tool to reach for
- Covering indexes avoid table lookups for frequently joined columns
- Monitor index bloat in write-heavy tables
- Partial indexes can save space when queries filter on a condition
