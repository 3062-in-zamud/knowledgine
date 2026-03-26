# LongMemEval Benchmark Results

**Date:** 2026-03-26
**Dataset:** LongMemEval-S (500 questions, CC BY 4.0)
**Source:** https://github.com/xiaowu0162/LongMemEval
**Judge:** Rule-based (string normalization + partial match)

## Summary

| Metric                               | Score     |
| ------------------------------------ | --------- |
| **Task-Averaged Accuracy** (primary) | **73.2%** |
| Baseline (before improvements)       | 50.5%     |
| Improvement                          | +22.7 pp  |

## Category Scores (After Improvements)

| Category                  | Accuracy | Baseline |
| ------------------------- | -------- | -------- |
| single-session-user       | 82.9%    | 75.7%    |
| single-session-assistant  | 96.4%    | 76.8%    |
| single-session-preference | 46.7%    | 6.7%     |
| temporal-reasoning        | 62.4%    | 42.1%    |
| knowledge-update          | 71.8%    | 55.1%    |
| multi-session             | 78.9%    | 46.6%    |

## Competitor Comparison

| System                   | Task-Avg Accuracy | Notes            |
| ------------------------ | ----------------- | ---------------- |
| Mem0                     | 49.0%             | LLM judge        |
| Zep                      | 71.0%             | LLM judge        |
| **Knowledgine**          | **73.2%**         | Rule-based judge |
| Supermemory Prod         | ~82-86%           | LLM judge        |
| Supermemory ASMR (8-var) | 98.6%             | LLM judge        |

> Note: Our results use a rule-based judge, which tends to underestimate true accuracy compared to LLM-based judges used by competitors. LLM judge scores would likely be higher.

## Key Improvements

1. **Date format parsing fix** — haystack dates (`"2023/05/20 (Sat) 02:21"`) were not parsed correctly, causing temporal-reasoning queries to fail silently. Fixed: 42.1% → 62.4%
2. **FTS5 query enhancement** — improved keyword weighting and query expansion
3. **Multi-session integration** — added cross-session synthesis support: 46.6% → 78.9%
4. **Preference extraction** — improved preference statement detection: 6.7% → 46.7%

## Weakness Analysis

### single-session-preference (46.7%)

Still the weakest category. Preference queries ("What is my favorite X?") require identifying implicit preference statements. FTS5 keyword search struggles with vague language like "like", "prefer", "favorite". Further improvement requires semantic understanding.

### temporal-reasoning (62.4%)

Significant improvement after date parsing fix, but still leaves room for improvement. Edge cases around relative dates and ambiguous temporal references remain.

## Reproducibility

```bash
pnpm run benchmark:longmemeval
```
