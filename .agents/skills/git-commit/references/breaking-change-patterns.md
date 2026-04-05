# Breaking Change Detection Patterns

## TypeScript / Node.js

### Exported Symbol Changes

Search staged diff for modifications to exported interfaces:

```bash
git diff --staged | grep -E '^\+.*export (function|interface|type|class|const|enum)'
git diff --staged | grep -E '^\-.*export (function|interface|type|class|const|enum)'
```

**Breaking if:**

- Exported function parameter added (without default), removed, or reordered
- Exported type/interface property removed or type changed
- Exported class method removed or signature changed
- Exported enum member removed

**Not breaking:**

- New export added (additive)
- Optional parameter added
- Parameter given a default value
- New property added to interface (if consumers use structural typing)

### Package.json Exports

```bash
git diff --staged -- '*/package.json' | grep -E '^\+|-.*"exports"'
```

**Breaking if:**

- Entry point path changed
- Export condition removed
- Subpath export removed

### Database Migrations

```bash
git diff --staged -- '**/migrations/**' | grep -iE '(DROP|RENAME|ALTER.*TYPE)'
```

**Breaking if:**

- Column dropped or renamed
- Column type changed (narrowing)
- Table dropped

**Not breaking:**

- New column with DEFAULT
- New table
- New index

### CLI Commands

```bash
git diff --staged -- '**/commands/**' | grep -E '^\-.*command\(|\.alias\('
```

**Breaking if:**

- Command name changed
- Required option removed
- Option renamed without alias

### Configuration Format

```bash
git diff --staged -- '*.config.*' '*rc*' | grep -E '^\-'
```

**Breaking if:**

- Required config key removed
- Config structure changed without migration path
