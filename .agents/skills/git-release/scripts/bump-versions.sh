#!/usr/bin/env bash
# bump-versions.sh — Update version in all package.json files
#
# Usage: bash bump-versions.sh <version>
# Example: bash bump-versions.sh 0.3.0
#
# Updates version in:
#   - package.json (root)
#   - packages/core/package.json
#   - packages/cli/package.json
#   - packages/ingest/package.json
#   - packages/mcp-server/package.json

set -euo pipefail

VERSION="${1:?Usage: bump-versions.sh <version>}"

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Invalid semver format: $VERSION" >&2
  echo "Expected format: X.Y.Z (e.g., 0.3.0)" >&2
  exit 1
fi

# Find repo root (where this script lives under .claude/skills/git-release/scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

FILES=(
  "package.json"
  "packages/core/package.json"
  "packages/cli/package.json"
  "packages/ingest/package.json"
  "packages/mcp-server/package.json"
)

echo "Bumping version to $VERSION in ${#FILES[@]} files..."

for f in "${FILES[@]}"; do
  FULL_PATH="$REPO_ROOT/$f"
  if [ ! -f "$FULL_PATH" ]; then
    echo "Warning: $f not found, skipping" >&2
    continue
  fi

  node -e "
    const fs = require('fs');
    const path = '$FULL_PATH';
    const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
    const oldVersion = pkg.version;
    pkg.version = '$VERSION';
    fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
    console.log('  ' + '$f' + ': ' + oldVersion + ' → ' + '$VERSION');
  "
done

echo "Done. All versions set to $VERSION."
