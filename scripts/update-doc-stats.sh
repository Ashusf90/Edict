#!/usr/bin/env bash
# update-doc-stats.sh — Keep hardcoded stats in markdown docs current.
# Called by .githooks/pre-commit. Uses content-based sed patterns (not line
# numbers) so it's resilient to doc restructuring.
#
# Speed: skips the expensive vitest run (~40s) when no test or example files
# are staged. Pass --force to always recount.
#
# Dependencies: node/npx (vitest), python3 (or python on Windows)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

FORCE=false
[ "${1:-}" = "--force" ] && FORCE=true

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Cross-platform in-place sed (macOS uses -i '', GNU uses -i)
sedi() {
  if sed --version 2>/dev/null | grep -q 'GNU'; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# Auto-detect python (Windows has 'python', unix has 'python3')
if command -v python3 &>/dev/null; then
  PYTHON=python3
elif command -v python &>/dev/null; then
  PYTHON=python
else
  echo "WARNING: python not found — skipping test count update" >&2
  PYTHON=""
fi

# ---------------------------------------------------------------------------
# 1. Detect what changed (skip expensive steps when possible)
# ---------------------------------------------------------------------------

TESTS_CHANGED=false
EXAMPLES_CHANGED=false

if [ "$FORCE" = true ]; then
  TESTS_CHANGED=true
  EXAMPLES_CHANGED=true
elif git rev-parse --is-inside-work-tree &>/dev/null; then
  # Check staged files for relevant changes
  STAGED=$(git diff --cached --name-only 2>/dev/null || true)
  echo "$STAGED" | grep -qE '\.test\.ts$' && TESTS_CHANGED=true
  echo "$STAGED" | grep -qE '\.edict\.json$' && EXAMPLES_CHANGED=true
else
  # Not in a git repo (manual run) — recount everything
  TESTS_CHANGED=true
  EXAMPLES_CHANGED=true
fi

# ---------------------------------------------------------------------------
# 2. Gather actual counts (only when relevant files changed)
# ---------------------------------------------------------------------------

TEST_COUNT=""
FILE_COUNT=""
EXAMPLE_COUNT=""

if [ "$EXAMPLES_CHANGED" = true ]; then
  EXAMPLE_COUNT=$(find examples -maxdepth 1 -name '*.edict.json' -type f | wc -l | tr -d ' ')
fi

if [ "$TESTS_CHANGED" = true ] && [ -n "$PYTHON" ]; then
  TMPFILE=$(mktemp)
  trap 'rm -f "$TMPFILE"' EXIT

  if ! npx vitest run --reporter=json > "$TMPFILE" 2>/dev/null; then
    echo "WARNING: vitest run failed — skipping test count update" >&2
  else
    TEST_COUNT=$($PYTHON -c "import json,sys
d = json.load(open('$TMPFILE'))
n = d.get('numTotalTests', 0)
if n < 1: sys.exit(1)
print(n)" 2>/dev/null) || { echo "WARNING: could not parse test count from vitest JSON" >&2; TEST_COUNT=""; }

    FILE_COUNT=$($PYTHON -c "import json,sys
d = json.load(open('$TMPFILE'))
n = len(d.get('testResults', []))
if n < 1: sys.exit(1)
print(n)" 2>/dev/null) || { echo "WARNING: could not parse file count from vitest JSON" >&2; FILE_COUNT=""; }
  fi
fi

# Nothing changed — exit early
if [ -z "$TEST_COUNT" ] && [ -z "$FILE_COUNT" ] && [ -z "$EXAMPLE_COUNT" ]; then
  echo "Doc stats: no test/example changes staged, skipping update."
  exit 0
fi

echo "Stats: ${TEST_COUNT:-unchanged} tests across ${FILE_COUNT:-unchanged} files, ${EXAMPLE_COUNT:-unchanged} examples"

# ---------------------------------------------------------------------------
# 3. Patch markdown files (content-based patterns, no line numbers)
# ---------------------------------------------------------------------------

# Core docs: all live stats get patched
CORE_DOCS=(
  README.md
  CONTRIBUTING.md
  AGENTS.md
)

for doc in "${CORE_DOCS[@]}"; do
  [ -f "$doc" ] || continue

  if [ -n "$TEST_COUNT" ] && [ -n "$FILE_COUNT" ]; then
    sedi -E "s/[0-9]+ tests across [0-9]+ files/${TEST_COUNT} tests across ${FILE_COUNT} files/g" "$doc"
  fi

  if [ -n "$EXAMPLE_COUNT" ]; then
    sedi -E "s/[0-9]+ example programs/${EXAMPLE_COUNT} example programs/g" "$doc"
    sedi -E "s/Returns [0-9]+ example/Returns ${EXAMPLE_COUNT} example/g" "$doc"
  fi
done

# ROADMAP.md and FEATURE_SPEC.md have a mix of live stats and historical phase
# targets (e.g. "Define 10 example programs"). Only patch the live patterns:
if [ -n "$EXAMPLE_COUNT" ]; then
  for doc in ROADMAP.md FEATURE_SPEC.md; do
    [ -f "$doc" ] || continue
    sedi -E "s/→ [0-9]+ example programs/→ ${EXAMPLE_COUNT} example programs/g" "$doc"
    sedi -E "s/and [0-9]+ example programs as part of/and ${EXAMPLE_COUNT} example programs as part of/g" "$doc"
  done
fi

echo "Done. Updated docs with current stats."
