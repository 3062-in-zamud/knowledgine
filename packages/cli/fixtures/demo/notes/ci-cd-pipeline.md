---
tags:
  - ci-cd
  - github-actions
  - testing
author: demo-user
project: infrastructure
---
# CI/CD Pipeline Setup and Debugging

## Problem
The CI pipeline was taking 25 minutes per push, blocking the
development workflow. Flaky tests caused unnecessary re-runs.

## Investigation
Analyzed GitHub Actions run logs:
- Dependency install: 4 minutes (no caching)
- Build: 3 minutes
- Tests: 15 minutes (sequential, with 3 flaky tests)
- Deploy: 3 minutes

## Solution: Optimized Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - run: pnpm test:run --reporter=verbose
        env:
          CI: true

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
```

### Flaky Test Fix
```typescript
// Before: timing-dependent test
it("should debounce input", async () => {
  fireEvent.change(input, { target: { value: "test" } });
  await new Promise((r) => setTimeout(r, 300));
  expect(onSearch).toHaveBeenCalledTimes(1);
});

// After: deterministic with fake timers
it("should debounce input", () => {
  vi.useFakeTimers();
  fireEvent.change(input, { target: { value: "test" } });
  vi.advanceTimersByTime(300);
  expect(onSearch).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

## Results
- Pipeline time: 25 min → 8 min (68% reduction)
- Flaky test rate: 15% → 0%
- Developer satisfaction significantly improved

## Learnings
- Cache dependencies aggressively in CI
- Run lint and tests in parallel jobs
- Flaky tests erode trust — fix them immediately
- Use `--frozen-lockfile` to catch dependency drift
- Fake timers eliminate timing-based flakiness
