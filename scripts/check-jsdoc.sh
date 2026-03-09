#!/usr/bin/env bash
# =============================================================================
# check-jsdoc.sh — Enforce JSDoc on all exported functions in public API files
# =============================================================================
# Usage: bash scripts/check-jsdoc.sh
# Exit code: 0 if all exports have JSDoc, 1 if any are missing
#
# Add to CI:  npm run check:jsdoc   (see package.json scripts)
# Add to pre-commit: npx husky add .husky/pre-commit "bash scripts/check-jsdoc.sh"

set -euo pipefail

# Files re-exported via src/index.ts (the public API surface)
PUBLIC_API_FILES=(
  src/validator/validate.ts
  src/resolver/resolve.ts
  src/resolver/levenshtein.ts
  src/checker/check.ts
  src/checker/types-equal.ts
  src/effects/effect-check.ts
  src/effects/call-graph.ts
  src/contracts/verify.ts
  src/contracts/generate-tests.ts
  src/contracts/hash.ts
  src/contracts/z3-context.ts
  src/contracts/translate.ts
  src/codegen/codegen.ts
  src/codegen/runner.ts
  src/check.ts
  src/compile.ts
  src/lint/lint.ts
  src/lint/warnings.ts
  src/patch/apply.ts
  src/compose/compose.ts
  src/multi-module.ts
  src/incremental/check.ts
  src/incremental/dep-graph.ts
  src/incremental/diff.ts
  src/compact/expand.ts
  src/errors/explain.ts
  src/errors/error-catalog.ts
)

missing=0
total=0

for f in "${PUBLIC_API_FILES[@]}"; do
  [ -f "$f" ] || continue

  # Find all lines with exported functions/classes
  grep -n "^export function\|^export async function\|^export class" "$f" | while IFS=: read -r ln rest; do
    total=$((total + 1))
    prev=$((ln - 1))
    prevline=$(sed -n "${prev}p" "$f")

    # Check for multi-line JSDoc ending (` */`) or single-line JSDoc (`/** ... */`)
    if echo "$prevline" | grep -q '^\s*\*/' || echo "$prevline" | grep -q '/\*\*.*\*/'; then
      : # Has JSDoc
    else
      echo "❌ Missing JSDoc: $f:$ln  $(echo "$rest" | head -c 80)"
      missing=$((missing + 1))
    fi
  done
done

if [ "$missing" -gt 0 ]; then
  echo ""
  echo "Found $missing exported function(s) without JSDoc."
  echo "Every exported function in the public API must have a JSDoc comment."
  exit 1
else
  echo "✅ All exported functions in public API files have JSDoc."
  exit 0
fi
