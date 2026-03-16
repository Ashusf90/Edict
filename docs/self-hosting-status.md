# Self-Hosting Status — Edict Compiler in WASM

> Definitive status of WASM self-hosting: what works, what's blocked, and conditions for full self-hosting.

**Date**: 2026-03-16
**Parent issue**: [#81](https://github.com/Sowiedu/Edict/issues/81)
**Related**: [#134](https://github.com/Sowiedu/Edict/issues/134) (feasibility study), [#156](https://github.com/Sowiedu/Edict/issues/156) (check-only PoC)

---

## Executive Summary

The Edict compiler's **check pipeline (phases 1–3)** is self-hostable today via QuickJS-WASM. The `EdictQuickJS` class provides a reusable API running schema validation, name resolution, type checking, and effect checking at **3.7x slowdown** vs native Node.js, in a **357 KB** bundle with **684 KB** runtime memory.

**Full self-hosting (including WASM codegen) is blocked** by binaryen's incompatibility with QuickJS. Two independent issues prevent it: binaryen's use of top-level `await` and QuickJS's lack of the `WebAssembly` API.

---

## What Works

| Pipeline Stage | Status | Notes |
|----------------|--------|-------|
| Schema validation (phase 1) | ✅ Works | Full structural + semantic validation |
| Name resolution (phase 2a) | ✅ Works | Levenshtein suggestions included |
| Type checking (phase 2b) | ✅ Works | Bidirectional type inference |
| Effect checking (phase 3) | ✅ Works | Call-graph propagation |
| Lint engine | ✅ Works | Included in check bundle |
| Patch engine | ✅ Works | Surgical AST patching by nodeId |
| Fragment composition | ✅ Works | Composable program fragments |
| Compact AST expansion | ✅ Works | Token-efficient format support |
| Schema migration | ✅ Works | Auto-upgrade older ASTs |
| Contract verification (phase 4) | ❌ Blocked | Z3 requires worker threads + WebAssembly API |
| WASM codegen (phase 5) | ❌ Blocked | Binaryen incompatible (see below) |
| WASM execution (phase 6) | ❌ Blocked | QuickJS lacks WebAssembly API |

---

## Bundle Sizes

| Bundle | Format | Size | Contents |
|--------|--------|------|----------|
| **Check-only** | IIFE | **357 KB** | Phases 1–3: validate, resolve, typeCheck, effectCheck, lint, patch, compose |
| Full (shimmed) | IIFE | **784 KB** | Phases 1–5 (binaryen stubbed — non-functional for codegen) |
| Browser check-only | ESM | 330.9 KB | Same scope as IIFE check bundle |
| Browser full | ESM | 13.6 MB | Full pipeline with binaryen WASM |

The IIFE bundles are built by `scripts/build-quickjs-bundle.ts`. Node.js modules and binaryen are shimmed to empty stubs via esbuild. Z3 is excluded entirely.

### Dependency Size Breakdown (estimated)

| Dependency | Size | Self-hostable? |
|------------|------|----------------|
| QuickJS engine (WASM) | ~1 MB | ✅ Host runtime |
| Edict compiler JS | 357 KB | ✅ IIFE bundle |
| Binaryen (WASM) | ~3 MB | ❌ Requires WebAssembly API |
| Z3 solver (WASM) | ~5 MB | ❌ Requires WebAssembly API + worker threads |
| **Theoretical full bundle** | **~10 MB** | ❌ Blocked by binaryen + Z3 |

---

## Performance

| Metric | QuickJS (WASM) | Native (Node.js) | Ratio |
|--------|---------------|-------------------|-------|
| QuickJS init | 9.3 ms | — | — |
| Bundle load | 30.6 ms | — | — |
| `checkBrowser(fibonacci)` | **2.3 ms** | **0.6 ms** | **3.7x** |

- 5 runs, median values
- Platform: darwin-arm64 (Apple Silicon), Node v22.14.0
- Test program: `fibonacci.edict.json` (~40 AST nodes, recursive with contracts)
- Native Node.js uses JIT compilation; QuickJS is a pure interpreter in WASM — 3.7x is excellent

### Memory Footprint

| Category | Count | Size |
|----------|-------|------|
| Memory allocated | 12,823 blocks | ~100 KB |
| Memory used | — | **683 KB** |
| Atoms (interned strings) | 2,075 | ~82 KB |
| Objects | 3,770 | ~181 KB |
| Bytecode functions | 437 | ~219 KB |

---

## Blockers

### 1. Binaryen — Top-Level `await` (Critical)

Binaryen's npm package uses `export default await init()` at module level. The IIFE format (required for QuickJS, which doesn't support ESM) cannot express top-level `await`. The esbuild bundler rejects this at build time.

**Impact**: Cannot bundle binaryen into the QuickJS IIFE format.

### 2. Binaryen — No `WebAssembly` API (Critical)

QuickJS is a pure JavaScript interpreter — it does not implement the `WebAssembly` global. Binaryen requires `WebAssembly.instantiate()` to load its own WASM binary internally.

**Impact**: Even if blocker #1 were resolved, binaryen would fail at runtime.

### 3. Z3 — Same WebAssembly Dependency (Critical)

The Z3 solver WASM package has the same `WebAssembly` API dependency as binaryen. Additionally, Z3 uses worker threads for timeout handling, which QuickJS does not support.

**Impact**: Contract verification (phase 4) cannot run in QuickJS.

### 4. Missing Web APIs (Mitigated)

QuickJS lacks `TextEncoder` and `TextDecoder`. These are polyfilled with minimal UTF-8 implementations (~40 lines) injected at startup. This is a solved problem.

### 5. No ESM Support (Mitigated)

QuickJS doesn't support `import`/`export`. Solved by using IIFE format bundles via esbuild.

---

## Paths to Full Self-Hosting

### Path A: Pure-JS WASM Encoder (Medium-Term, Recommended)

Replace binaryen with a pure-JavaScript WASM binary encoder. This eliminates both binaryen blockers entirely.

**Candidates**:
- `@aspect/wasm-encoder` — lightweight JS WASM binary writer
- Custom minimal encoder — Edict uses a subset of WASM opcodes

**Pros**: No WASM dependency, no top-level await, works in any JS runtime
**Cons**: Must reimplement the binaryen API surface used by Edict's codegen
**Effort**: 2–4 weeks (Edict's codegen uses a moderate subset of binaryen)

### Path B: QuickJS WebAssembly API (Long-Term, Watch)

The `quickjs-emscripten` project is working on WebAssembly API support. When available, binaryen and Z3 might work with minimal changes.

**Pros**: Zero Edict changes needed
**Cons**: Uncertain timeline, may not support all WASM features binaryen needs
**Effort**: 0 (waiting only)

### Path C: QuickJS Bytecode Backend (Long-Term, Alternative)

Add a QuickJS bytecode backend alongside WASM. The compiler runs in QuickJS, and programs compile to QuickJS bytecode for execution in the same runtime — no `WebAssembly` API needed.

**Pros**: Fully self-contained, no external dependencies
**Cons**: New backend, not interoperable with non-QuickJS runtimes
**Effort**: 4–8 weeks

### Path D: V8 Isolates (Alternative)

Use V8 isolates (`isolated-vm`) instead of QuickJS. Full JavaScript and WebAssembly API compatibility at the cost of larger binary size.

**Pros**: Full API compatibility, JIT performance
**Cons**: Large binary (~40 MB), heavier runtime, not truly self-hosted in WASM
**Effort**: 2–3 weeks

---

## Recommended Strategy

1. **Now**: Ship the check-only self-hosting via `EdictQuickJS` (`src/quickjs/edict-quickjs.ts`). Phases 1–3 at 3.7x slowdown in 357 KB is immediately useful for sandboxed/edge validation.

2. **Next**: Evaluate Path A (pure-JS WASM encoder) as the primary path to full codegen self-hosting. Scope the binaryen API surface Edict actually uses and assess replacement effort.

3. **Watch**: Monitor QuickJS WebAssembly API progress (Path B). If it ships before Path A is complete, it may be the simpler path.

---

## Files and Resources

| File | Purpose |
|------|---------|
| [`src/quickjs/edict-quickjs.ts`](../src/quickjs/edict-quickjs.ts) | Reusable `EdictQuickJS` class for check-only self-hosting |
| [`scripts/build-quickjs-bundle.ts`](../scripts/build-quickjs-bundle.ts) | esbuild script for IIFE bundles |
| [`tests/quickjs/quickjs-check.test.ts`](../tests/quickjs/quickjs-check.test.ts) | Integration tests (fibonacci, hello, arithmetic) |
| [`docs/quickjs-feasibility-report.md`](quickjs-feasibility-report.md) | Detailed feasibility study results |
| [`quickjs-feasibility-results.json`](../quickjs-feasibility-results.json) | Machine-readable benchmark data |
| [`dist/edict-quickjs-check.js`](../dist/edict-quickjs-check.js) | Pre-built check-only IIFE bundle (357 KB) |
