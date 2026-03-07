---
description: Run the full CI pipeline locally to verify changes before pushing
---

# /verify — Local CI Mirror

Run the exact same checks CI runs, locally. Use before pushing to catch issues early.

// turbo-all

## Steps

1. Type check: `npm run typecheck`
2. Build: `npm run build`
3. Run tests: `npm run test:coverage`
4. Validate examples: `npm run validate-examples`

## One-Command Alternative

```bash
npm run ci:local
```

This runs typecheck → build → test → validate-examples sequentially, stopping on first failure.
