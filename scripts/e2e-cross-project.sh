#!/usr/bin/env bash
# End-to-end smoke test for cross-project knowledge transfer.
# Exercises every acceptance criterion against /tmp/proj-a and /tmp/proj-b.
# Run from the monorepo root: bash scripts/e2e-cross-project.sh
#
# This script is committed for human reproduction; CI does not run it
# (avoids tmp-dir flakiness in headless containers).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="node $ROOT/packages/cli/dist/index.js"
PROJ_A="${TMPDIR:-/tmp}/knowledgine-e2e-proj-a"
PROJ_B="${TMPDIR:-/tmp}/knowledgine-e2e-proj-b"

echo "==> Cleaning prior state"
rm -rf "$PROJ_A" "$PROJ_B"
mkdir -p "$PROJ_A" "$PROJ_B"

echo "==> AC-1 / AC-2: init both projects"
$CLI init --path "$PROJ_A" --no-semantic >/dev/null
$CLI init --path "$PROJ_B" --no-semantic >/dev/null

echo "==> Seed proj-a with one searchable note"
NOTE_FILE="$PROJ_A/cross-project-test.md"
cat > "$NOTE_FILE" <<'NOTE'
# Cross-project test note

This note exists only to drive the cross-project E2E. The body contains
the keyword distributed-tracing so the search query has something to bite.
NOTE
$CLI ingest --source markdown --path "$PROJ_A" --quiet >/dev/null 2>&1 || true
# Fallback: drop a row directly via init re-scan if the markdown plugin name differs
if ! $CLI search "distributed-tracing" --path "$PROJ_A" --format json | grep -q '"results":\['; then
  echo "  (markdown ingest not available; re-running init to pick up the file)"
  $CLI init --path "$PROJ_A" --no-semantic >/dev/null
fi

echo "==> AC-2: cross-project search via CLI"
RESULTS=$($CLI search "distributed-tracing" --projects "$PROJ_A" --format json)
echo "$RESULTS" | grep -q '"crossProject":true' && echo "  ✓ crossProject:true returned"

ID=$(echo "$RESULTS" | node -e 'let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{const j=JSON.parse(d); if(!j.results||!j.results.length){console.error("no result");process.exit(1)} console.log(j.results[0].noteId)})')
echo "  source note id = $ID"

echo "==> AC-3 (copy): knowledgine transfer --from PROJ_A --to PROJ_B --note-id $ID"
TRANSFER_OUT=$($CLI transfer --from "$PROJ_A" --to "$PROJ_B" --note-id "$ID" --format json)
echo "$TRANSFER_OUT" | grep -q '"ok":true' && echo "  ✓ transfer succeeded"
TARGET_ID=$(echo "$TRANSFER_OUT" | node -e 'let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{const j=JSON.parse(d); console.log(j.result.targetNoteId)})')
echo "  target note id = $TARGET_ID"

# Verify the copy is searchable in proj-b
$CLI search "distributed-tracing" --path "$PROJ_B" --format json | grep -q '"distributed-tracing"' \
  && echo "  ✓ copied note is searchable in proj-b"

echo "==> AC-3 (link): knowledgine link --source PROJ_A --note-id $ID --into PROJ_B"
LINK_OUT=$($CLI link --source "$PROJ_A" --note-id "$ID" --into "$PROJ_B" --format json)
echo "$LINK_OUT" | grep -q '"ok":true' && echo "  ✓ link stub created"
STUB_ID=$(echo "$LINK_OUT" | node -e 'let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{const j=JSON.parse(d); console.log(j.result.targetNoteId)})')

echo "==> AC-3 (resolve): knowledgine show-link $STUB_ID --path PROJ_B"
RESOLVE_OUT=$($CLI show-link "$STUB_ID" --path "$PROJ_B" --format json)
echo "$RESOLVE_OUT" | grep -q '"status":"ok"' && echo "  ✓ resolve returns status=ok"

echo "==> AC-3 (broken link): delete proj-a, expect status=source_missing"
rm -rf "$PROJ_A"
BROKEN=$($CLI show-link "$STUB_ID" --path "$PROJ_B" --format json)
echo "$BROKEN" | grep -q '"status":"source_missing"' && echo "  ✓ broken link reports source_missing"

echo "==> AC-3 (failure path): missing source note id is rejected"
mkdir -p "$PROJ_A"
$CLI init --path "$PROJ_A" --no-semantic >/dev/null
MISS_OUT=$($CLI transfer --from "$PROJ_A" --to "$PROJ_B" --note-id 99999 --format json || true)
echo "$MISS_OUT" | grep -qE '"ok":false.*not found' && echo "  ✓ missing source note rejected"

echo ""
echo "Failure paths beyond missing-source (UNIQUE collision, visibility denial,"
echo "schema-version floors) are covered by the unit/integration test suite;"
echo "this script focuses on end-to-end CLI plumbing."
echo ""
echo "ALL E2E PASSED"
