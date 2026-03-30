# knowledgine v0.6.2 — Dogfooding Evaluation Framework

## Overview

This document defines the evaluation framework for re-dogfooding knowledgine v0.6.2
after the quality improvements from the v0.6.1 dogfooding synthesis report.

**Goal**: Achieve average score 90+/100 (up from 50/100 in v0.6.1)

## Test Matrix

### Testers

Same 5 testers from v0.6.1 evaluation.

### Target Repositories

Same 5 OSS projects from v0.6.1:

1. Small TypeScript project (~100 files)
2. Medium Python project (~500 files)
3. Large monorepo (~2000 files)
4. Multi-language project (JS + Rust)
5. Documentation-heavy project (mostly .md)

## Evaluation Scenarios (10)

### Setup & Initialization

1. **Init -> Ingest -> Search pipeline** (10 pts)
   - `knowledgine init --path .` completes without errors
   - `knowledgine ingest --all --path .` processes files and generates embeddings
   - `knowledgine search "query"` returns relevant results
   - Next-step hints displayed after each command

2. **Doctor health check** (10 pts)
   - `knowledgine doctor --path .` runs all 10+ diagnostics
   - Health score displayed
   - Fix commands suggested for any issues

### Search Quality

3. **Keyword search — English** (10 pts)
   - Query: technology name in the repo (e.g., "authentication")
   - P@5 >= 80% (4 of top 5 results are relevant)
   - Latency P95 < 500ms
   - Snippets shown with query context

4. **Keyword search — Japanese/CJK** (10 pts)
   - Query: 2-character CJK term (e.g., "認証")
   - Returns results (not empty — LIKE fallback working)
   - 3+ character CJK uses trigram index
   - Latency P95 < 500ms

5. **Hybrid search** (10 pts)
   - Query: conceptual query (e.g., "how does error handling work")
   - Hybrid mode activated by default when embeddings exist
   - Both keyword and semantic scores contribute
   - Better results than keyword-only for conceptual queries

6. **Compound query** (10 pts)
   - `"routing performance"` returns phrase matches
   - `auth OR authentication` returns union results
   - Multi-word AND query with 0 results falls back to OR with notification

### Entity & Exploration

7. **Entity extraction quality** (10 pts)
   - `knowledgine explain --entity <name>` shows entity details
   - No Markdown artifacts in entity names
   - No generic terms (README, src, etc.) in top entities
   - Unknown type entities show "type not yet classified" message

8. **Cross-entity navigation** (10 pts)
   - Entity-linked notes appear higher in keyword search results
   - `knowledgine search --related <noteId>` returns related notes

### Infrastructure

9. **REST API** (10 pts)
   - `knowledgine serve --auth` generates token and requires auth
   - Rate limiting headers present
   - Security warning when binding to 0.0.0.0 without auth
   - `GET /search?q=...` returns results with modeUsed field

10. **Status & Diagnostics** (10 pts)
    - `knowledgine status` shows accurate embedding coverage percentage
    - `knowledgine stats` (top-level alias) works
    - `knowledgine doctor` provides actionable fix commands

## Scoring Guide

| Score Range | Rating    | Description                             |
| ----------- | --------- | --------------------------------------- |
| 90-100      | Excellent | Production-ready for daily use          |
| 80-89       | Good      | Minor issues, usable with workarounds   |
| 70-79       | Fair      | Notable issues affecting workflow       |
| 60-69       | Poor      | Significant problems, needs improvement |
| < 60        | Failing   | Critical issues preventing basic use    |

## Comparison Scorecard Template

| Scenario          | Tester 1 | Tester 2 | Tester 3 | Tester 4 | Tester 5 | Avg |
| ----------------- | -------- | -------- | -------- | -------- | -------- | --- |
| 1. Init pipeline  |          |          |          |          |          |     |
| 2. Doctor         |          |          |          |          |          |     |
| 3. EN keyword     |          |          |          |          |          |     |
| 4. CJK keyword    |          |          |          |          |          |     |
| 5. Hybrid search  |          |          |          |          |          |     |
| 6. Compound query |          |          |          |          |          |     |
| 7. Entity quality |          |          |          |          |          |     |
| 8. Cross-entity   |          |          |          |          |          |     |
| 9. REST API       |          |          |          |          |          |     |
| 10. Status/Diag   |          |          |          |          |          |     |
| **Total**         |          |          |          |          |          |     |

## v0.6.1 vs v0.6.2 Comparison

Track improvements against v0.6.1 baseline (avg: 50/100):

| Area           | v0.6.1 Issue                    | v0.6.2 Fix                | Expected Impact |
| -------------- | ------------------------------- | ------------------------- | --------------- |
| Embeddings     | Not auto-generated after ingest | KNOW-369: auto-generate   | +15 pts         |
| CJK search     | 0 results for Japanese          | KNOW-376: LIKE fallback   | +10 pts         |
| Search quality | No hybrid default               | KNOW-385: dynamic default | +5 pts          |
| DB security    | Permissions 644                 | KNOW-382: 600             | +3 pts          |
| User flow      | No guidance                     | KNOW-385: next-step hints | +5 pts          |
| Diagnostics    | No health check                 | KNOW-389: doctor command  | +5 pts          |

## Running the Evaluation

```bash
# For each test repository:
cd /path/to/test-repo
knowledgine init --path .
knowledgine ingest --all --path .
knowledgine doctor --path .

# Run through each scenario and score
```
