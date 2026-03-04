# Lessons Learned

## Worker Threads + TypeScript in ESM Projects
- **Problem**: `worker_threads` with eval:true can't directly load `.ts` files in ESM projects
- **Failed approaches**: `--import tsx` in execArgv (doesn't work with eval workers), `require("node:module").register("tsx/esm", ...)` (tsx rejects loader-style registration), `require()` in worker script (`type: module` forces ESM in eval workers)
- **Solution**: Use `tsx/esm/api`'s programmatic `register()` inside the worker script before importing `.ts` modules
- **Pattern**: In the inline ESM worker, conditionally register tsx only when importing `.ts` files:
```js
if (url.endsWith(".ts")) {
    const { register } = await import("tsx/esm/api");
    register();
}
```

## WASM Execution Timeout
- **Problem**: WASM `mainFn()` is synchronous — blocks the event loop, so `setTimeout`/`Promise.race` won't fire mid-execution
- **Solution**: Run WASM in a worker thread, terminate the worker from the main thread on timeout
- **Caveat**: Worker thread startup adds ~100-200ms overhead, so minimum effective timeout should be >= 100ms

## Test Fixtures for "Infinite Loops"
- **Problem**: Recursive infinite loops cause stack overflow (WASM trap) instead of running forever
- **Solution**: Use exponential-time algorithms (e.g., `fib(40)`) that take seconds without stack overflow

## WASM Type Inference for Indirect Calls
- **Problem**: `inferExprWasmType` in codegen returns `binaryen.i32` as default for call expressions where the fn is a local variable (indirect call). Float-returning indirect calls get wrong `call_indirect` result type.
- **Root cause**: Codegen's WASM type inference is heuristic-based and doesn't have access to the Edict type checker's `TypeEnv`.
- **Workaround**: Currently all HOF tests use Int-returning functions. This works correctly.
- **Proper fix**: Thread Edict type info (`TypeExpr`) through codegen, or build a richer type inference that can look up variable types from let-binding annotations.

## Closures — Uniform __env Convention
- **Design**: All user-defined functions get `__env: i32` as first WASM param (uniform calling convention for `call_indirect` signature compatibility). Non-capturing functions ignore it (value=0).
- **Critical distinction**: Only functions in `fnTableIndices` (user-defined) get `__env`. Builtins (`BUILTIN_FUNCTIONS`) and module imports (inferred via `inferImportSignatures`) are imported WASM functions — they do NOT have `__env`.
- **Bug pattern**: When prepending `__env=0` to direct calls, check `ctx.fnTableIndices.has(fnName)` (positive check) — NOT `!BUILTIN_FUNCTIONS.has(fnName)` (negative check), because imported functions like `map` from `std` are neither builtins nor user functions.
- **Closure pair**: Function values are heap-allocated pairs `[table_index: i32, env_ptr: i32]`. Indirect calls decompose the pair and pass `env_ptr` as first arg.

