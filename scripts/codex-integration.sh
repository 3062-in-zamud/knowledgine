#!/bin/bash
set -euo pipefail

# knowledgine x Codex CLI integration setup
# Usage: bash scripts/codex-integration.sh [--dry-run]

AGENTS_FILE="${HOME}/.codex/AGENTS.md"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

KNOWLEDGINE_SECTION='
## knowledgine (Local Knowledge Base)

Search past problem-solving patterns and code patterns:
```bash
knowledgine recall "<search query>"
knowledgine suggest --context "<what you are working on>"
knowledgine tool search --query "<keyword>" --mode hybrid
```

REST API (if `knowledgine serve` is running):
```bash
curl "http://localhost:3456/search?q=<query>&mode=hybrid"
```
'

if $DRY_RUN; then
  echo "=== Dry run: would append to $AGENTS_FILE ==="
  echo "$KNOWLEDGINE_SECTION"
  exit 0
fi

mkdir -p "$(dirname "$AGENTS_FILE")"

# Check if section already exists
if grep -q "knowledgine (Local Knowledge Base)" "$AGENTS_FILE" 2>/dev/null; then
  echo "knowledgine section already exists in $AGENTS_FILE"
  exit 0
fi

echo "$KNOWLEDGINE_SECTION" >> "$AGENTS_FILE"
echo "knowledgine integration added to $AGENTS_FILE"
