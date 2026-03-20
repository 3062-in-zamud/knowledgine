---
tags:
  - react
  - performance
  - frontend
author: demo-user
project: dashboard-app
---
# React Performance Optimization

## Issue
The dashboard page was taking 3+ seconds to render with 500 items.
React DevTools Profiler showed excessive re-renders on every state change.

## Root Cause Analysis
1. Parent component state changes triggered full list re-render
2. Inline arrow functions in JSX created new references each render
3. Large bundle size from importing entire icon library

## Fix: Memoization

```tsx
// Before: re-renders on every parent state change
const ListItem = ({ item, onClick }) => (
  <div onClick={() => onClick(item.id)}>{item.name}</div>
);

// After: memoized with stable callback
const ListItem = React.memo(({ item, onClick }) => (
  <div onClick={onClick}>{item.name}</div>
));

// Parent: stable callback reference
const handleClick = useCallback((id: string) => {
  setSelectedId(id);
}, []);
```

## Fix: Code Splitting

```tsx
// Before: eager import
import { AnalyticsChart } from "./AnalyticsChart";

// After: lazy loaded
const AnalyticsChart = React.lazy(() => import("./AnalyticsChart"));

function Dashboard() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AnalyticsChart data={data} />
    </Suspense>
  );
}
```

## Results
- Initial render: 3.2s → 0.8s (75% improvement)
- Re-render on selection: 450ms → 12ms
- Bundle size: 1.2MB → 680KB

## Learnings
- Profile before optimizing — measure actual bottlenecks
- React.memo only helps when props are actually stable
- Lazy loading is most effective for below-the-fold content
- Tree-shaking icon libraries saves significant bundle size
