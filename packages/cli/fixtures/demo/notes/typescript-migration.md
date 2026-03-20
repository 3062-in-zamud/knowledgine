---
tags:
  - typescript
  - migration
  - refactoring
author: demo-user
project: legacy-app
---
# JavaScript to TypeScript Migration

## Problem
The legacy Express app (50+ files) had no type safety. Runtime errors
were discovered only in production, and onboarding new developers
took weeks due to lack of type documentation.

## Migration Strategy
Adopted an incremental approach instead of a big-bang rewrite.

### Phase 1: Setup (Day 1)
```jsonc
// tsconfig.json - permissive start
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "strict": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

### Phase 2: Rename files (Week 1)
```bash
# Renamed .js → .ts one directory at a time
# Started with utility files that had no dependencies
find src/utils -name "*.js" -exec bash -c 'mv "$0" "${0%.js}.ts"' {} \;
```

### Phase 3: Add types gradually (Week 2-4)
```typescript
// Before: implicit any everywhere
function processUser(user) {
  return { name: user.name, role: user.role || "viewer" };
}

// After: explicit types
interface User {
  id: string;
  name: string;
  role?: "admin" | "editor" | "viewer";
}

function processUser(user: User): { name: string; role: string } {
  return { name: user.name, role: user.role ?? "viewer" };
}
```

### Phase 4: Enable strict mode (Week 5)
```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## Results
- Runtime type errors: 12/month → 0/month
- Onboarding time: 3 weeks → 1 week
- Refactoring confidence: significantly improved with IDE support

## Learnings
- Incremental migration is key — never stop shipping features
- Start with leaf files (utilities), move inward to core logic
- `@ts-expect-error` is better than `any` for tracking tech debt
- Enable `strict` as soon as possible to avoid accumulating debt
- The build time increase was negligible (< 2 seconds)
