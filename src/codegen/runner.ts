// =============================================================================
// WASM Runner — Execute compiled Edict WASM binaries
// =============================================================================
// Instantiates WASM via Node's WebAssembly API, provides host imports
// (e.g. print), captures output, and returns the result.
//
// Execution model:
//   run()       → spawns worker thread, enforces timeout, returns RunResult
//   runDirect() → synchronous execution (used by worker and tests)

import { Worker } from "node:worker_threads";
import { createHostImports } from "../builtins/registry.js";
import type { ReplayLog } from "../builtins/registry.js";
import { type RuntimeState, EdictOomError, getHeapUsage } from "../builtins/host-helpers.js";
import type { EdictHostAdapter } from "./host-adapter.js";
import type { ReplayToken, ReplayEntry } from "./replay-types.js";
import { createRecordingAdapter } from "./recording-adapter.js";
import { createReplayAdapter } from "./replay-adapter.js";

/* eslint-disable @typescript-eslint/no-namespace */
// Minimal WebAssembly type declarations for Node.js runtime
declare namespace WebAssembly {
    interface Memory {
        readonly buffer: ArrayBuffer;
    }
    interface Exports {
        [key: string]: unknown;
        memory?: Memory;
    }
    interface Instance {
        readonly exports: Exports;
    }
    interface InstantiateResult {
        instance: Instance;
    }
    interface Module {
        readonly __brand: unique symbol;
    }
    interface ModuleImportDescriptor {
        module: string;
        name: string;
        kind: "function" | "table" | "memory" | "global" | "tag";
    }
    interface ModuleExportDescriptor {
        name: string;
        kind: "function" | "table" | "memory" | "global" | "tag";
    }
    // Overload 1: bytes → { instance, module }
    function instantiate(
        bufferSource: Uint8Array,
        importObject?: Record<string, Record<string, unknown>>,
    ): Promise<InstantiateResult>;
    // Overload 2: compiled Module → Instance directly
    function instantiate(
        module: Module,
        importObject?: Record<string, Record<string, unknown>>,
    ): Promise<Instance>;
    function compile(bufferSource: Uint8Array): Promise<Module>;
    // eslint-disable-next-line @typescript-eslint/no-shadow
    namespace Module {
        function imports(module: Module): ModuleImportDescriptor[];
        function exports(module: Module): ModuleExportDescriptor[];
    }
}

/** Configuration for execution sandbox limits */
export interface RunLimits {
    /** Max execution time in ms (default: 15_000, min: 100) */
    timeoutMs?: number;
    /** Max WASM memory in MB (compile-time, default: 1) */
    maxMemoryMb?: number;
    /** Sandbox directory for file IO builtins. If unset, readFile/writeFile return Err. */
    sandboxDir?: string;
    /** Optional list of allowed hostnames for HTTP requests. If unset, all hosts are allowed. */
    allowedHosts?: string[];
    /** Optional host adapter for platform-specific operations. Defaults to NodeHostAdapter. */
    adapter?: EdictHostAdapter;
    /** External WASM modules keyed by import namespace (base64-encoded). */
    externalModules?: Record<string, string>;
    /** When true, record all non-deterministic host responses and return a ReplayToken. */
    record?: boolean;
    /** When provided, replay from this token instead of calling real host functions. */
    replayToken?: ReplayToken;
}

export interface RunResult {
    /** Captured stdout output */
    output: string;
    /** Exit code (0 = success) */
    exitCode: number;
    /** Return value from main (if any) */
    returnValue?: number;
    /** Runtime limit error, if execution was killed */
    error?: "execution_timeout" | "execution_oom";
    /** Limit values that were enforced */
    limitInfo?: { timeoutMs?: number; maxMemoryMb?: number };
    /** Heap bytes consumed by the program's allocations (only set on success) */
    heapUsed?: number;
    /** Replay token containing all recorded non-deterministic responses (only when record: true) */
    replayToken?: ReplayToken;
}

/**
 * Run a compiled Edict WASM binary with sandbox limits.
 *
 * Spawns a worker thread and enforces a timeout. If execution exceeds
 * the timeout, the worker is terminated and a structured error is returned.
 *
 * @param wasm - The WASM binary (Uint8Array from codegen)
 * @param entryFn - Name of the function to call (default: "main")
 * @param limits - Optional execution limits (timeout, memory)
 */
export async function run(
    wasm: Uint8Array,
    entryFn: string = "main",
    limits: RunLimits = {},
): Promise<RunResult> {
    const timeoutMs = Math.max(100, limits.timeoutMs ?? 15_000);

    return new Promise<RunResult>((resolvePromise) => {
        // import.meta.url is the URL of this module (runner.ts in dev, runner.js in prod).
        // The worker dynamically imports this same module to call runDirect().
        const runnerModuleUrl = import.meta.url;

        let timer: ReturnType<typeof setTimeout> | null = null;
        let settled = false;

        // Inline ESM worker script. Since package.json has "type": "module",
        // eval workers run in ESM mode — we use import rather than require.
        // For dev/vitest (.ts files), we register the tsx ESM loader first.
        const workerScript = `
            import { workerData, parentPort } from "node:worker_threads";

            const url = workerData.runnerModuleUrl;

            // In dev/vitest, module URL ends in .ts — register tsx ESM loader
            if (url.endsWith(".ts")) {
                const { register } = await import("tsx/esm/api");
                register();
            }

            try {
                const runner = await import(url);
                const wasmBytes = new Uint8Array(workerData.wasm);
                const result = await runner.runDirect(wasmBytes, workerData.entryFn, { sandboxDir: workerData.sandboxDir, allowedHosts: workerData.allowedHosts, externalModules: workerData.externalModules, record: workerData.record, replayToken: workerData.replayToken });
                parentPort.postMessage({ type: "result", data: result });
            } catch (e) {
                parentPort.postMessage({
                    type: "error",
                    message: e instanceof Error ? e.message : String(e),
                });
            }
        `;

        const worker = new Worker(workerScript, {
            eval: true,
            workerData: {
                wasm: Buffer.from(wasm),
                entryFn,
                runnerModuleUrl,
                sandboxDir: limits.sandboxDir,
                allowedHosts: limits.allowedHosts,
                externalModules: limits.externalModules,
                record: limits.record,
                replayToken: limits.replayToken,
            },
            // Register tsx ESM loader so the worker can import .ts files (vitest/dev)
            execArgv: ["--import", "tsx"],
        });

        function settle(result: RunResult): void {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolvePromise(result);
        }

        // Timeout — kill the worker
        timer = setTimeout(() => {
            worker.terminate().then(() => {
                settle({
                    output: "",
                    exitCode: 1,
                    error: "execution_timeout",
                    limitInfo: { timeoutMs },
                });
            });
        }, timeoutMs);

        // Worker completed successfully
        worker.on("message", (msg: { type: string; data?: RunResult; message?: string }) => {
            if (msg.type === "result" && msg.data) {
                settle(msg.data);
            } else if (msg.type === "error") {
                settle({
                    output: msg.message ?? "Worker execution error",
                    exitCode: 1,
                });
            }
        });

        // Worker crashed (OOM, etc.)
        worker.on("error", (err: Error) => {
            const isOom = err.message?.includes("out of memory") ||
                err.message?.includes("memory access") ||
                err.message?.includes("grow");
            settle({
                output: `Runtime error: ${err.message}`,
                exitCode: 1,
                error: isOom ? "execution_oom" : undefined,
                limitInfo: isOom ? { maxMemoryMb: limits.maxMemoryMb ?? 1 } : undefined,
            });
        });

        // Worker exited unexpectedly
        worker.on("exit", (code) => {
            if (code !== 0) {
                settle({
                    output: "",
                    exitCode: code,
                    error: "execution_timeout",
                    limitInfo: { timeoutMs },
                });
            }
        });
    });
}

/**
 * Direct (in-process) WASM execution — no worker thread, no timeout.
 *
 * Used by the worker thread internally and available for tests
 * that don't need sandbox limits.
 *
 * @param wasm - The WASM binary (Uint8Array from codegen)
 * @param entryFn - Name of the function to call (default: "main")
 * @param limits - Optional execution limits (sandboxDir for file IO)
 */
export async function runDirect(
    wasm: Uint8Array,
    entryFn: string = "main",
    limits: RunLimits = {},
): Promise<RunResult> {
    // Set up recording or replay infrastructure
    const adapterEntries: ReplayEntry[] = [];
    const builtinEntries: ReplayEntry[] = [];
    let replayLog: ReplayLog | undefined;
    let effectiveAdapter: EdictHostAdapter | undefined = limits.adapter;

    if (limits.replayToken) {
        // Replay mode: split token entries into adapter and builtin entries
        // Adapter entries go to the replay adapter, builtin entries go to the replay log
        const adapterReplayEntries: ReplayEntry[] = [];
        const builtinReplayEntries: ReplayEntry[] = [];
        for (const entry of limits.replayToken.responses) {
            // Adapter methods are: fetch, readFile, writeFile, env, args, sha256, md5, hmac
            // Builtin entries come from nondeterministic domain builtins
            if (["fetch", "readFile", "writeFile", "env", "args", "sha256", "md5", "hmac", "exit"].includes(entry.kind)) {
                adapterReplayEntries.push(entry);
            } else {
                builtinReplayEntries.push(entry);
            }
        }
        effectiveAdapter = createReplayAdapter(adapterReplayEntries, { i: 0 });
        replayLog = { mode: "replay", entries: builtinReplayEntries, cursor: { i: 0 } };
    } else if (limits.record) {
        // Record mode: wrap adapter with recording proxy, set up builtin recording
        replayLog = { mode: "record", entries: builtinEntries };
        // Adapter recording is handled by createRecordingAdapter — it wraps whatever
        // adapter is used (default NodeHostAdapter is created inside createHostImports
        // if none provided, so we need to handle this carefully)
    }

    const state: RuntimeState = { outputParts: [], instance: null, sandboxDir: limits.sandboxDir, allowedHosts: limits.allowedHosts };

    // When recording, wrap the adapter with a recording proxy
    if (limits.record && !limits.replayToken) {
        // We need to get the real adapter first, then wrap it
        // createHostImports will use NodeHostAdapter if none provided
        // So we'll provide a recording adapter wrapper
        const { NodeHostAdapter } = await import("./node-host-adapter.js");
        const realAdapter = limits.adapter ?? new NodeHostAdapter(limits.sandboxDir);
        effectiveAdapter = createRecordingAdapter(realAdapter, adapterEntries);
    }

    const importObject = createHostImports(state, effectiveAdapter, replayLog);

    // =========================================================================
    // Two-phase external module instantiation (shared memory for String/Array)
    // =========================================================================
    // Phase 1 (pre-Edict): Compile each external module to inspect its imports.
    //   - No memory import → instantiate immediately, pass exports directly (v1).
    //   - Imports memory → defer. Use Module.exports() to discover function
    //     names, create mutable delegates. Delegates satisfy Edict's imports.
    // Phase 2 (post-Edict): Build a shared import object from each deferred
    //   module's actual import declarations (namespace-agnostic). Instantiate
    //   with Edict's memory + heap allocator, then patch delegates.
    // =========================================================================

    interface DelegateRef { fn: ((...args: unknown[]) => unknown) | null }
    const delegateRefs = new Map<string, DelegateRef>();            // "ns.name" → ref
    const deferredModules = new Map<string, WebAssembly.Module>();  // namespace → compiled module
    const needsSharedMemory = new Set<string>();                    // namespaces that import memory

    if (limits.externalModules) {
        for (const [namespace, base64] of Object.entries(limits.externalModules)) {
            // Protect reserved namespaces — builtins take precedence
            if (importObject[namespace]) continue;
            try {
                const extBytes = new Uint8Array(
                    typeof Buffer !== "undefined"
                        ? Buffer.from(base64, "base64")
                        : Uint8Array.from(atob(base64), c => c.charCodeAt(0)),
                );

                // Compile once — reused for both inspection and instantiation
                const compiled = await WebAssembly.compile(extBytes);
                const moduleImports = WebAssembly.Module.imports(compiled);
                const importsMemory = moduleImports.some(imp => imp.kind === "memory");

                if (importsMemory) {
                    // V2 path: needs shared memory — defer instantiation to Phase 2.
                    // Discover exported function names from the compiled module itself
                    // (no need to compile the Edict binary).
                    needsSharedMemory.add(namespace);
                    deferredModules.set(namespace, compiled);

                    const moduleExports = WebAssembly.Module.exports(compiled);
                    const nsExports: Record<string, unknown> = {};
                    for (const exp of moduleExports) {
                        if (exp.kind === "function") {
                            const ref: DelegateRef = { fn: null };
                            delegateRefs.set(`${namespace}.${exp.name}`, ref);
                            nsExports[exp.name] = (...args: unknown[]) => {
                                if (!ref.fn) throw new Error(`External function ${namespace}.${exp.name} not yet linked`);
                                return ref.fn(...args);
                            };
                        }
                    }
                    importObject[namespace] = nsExports;
                } else {
                    // V1 path: no shared memory — instantiate immediately, direct references
                    const extInstance = await WebAssembly.instantiate(compiled, {});
                    const nsExports: Record<string, unknown> = {};
                    for (const [key, val] of Object.entries(extInstance.exports)) {
                        if (typeof val === "function") {
                            nsExports[key] = val;  // direct — no delegate overhead
                        }
                    }
                    importObject[namespace] = nsExports;
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return {
                    output: `External module error (${namespace}): ${msg}`,
                    exitCode: 1,
                };
            }
        }
    }

    let instance: WebAssembly.Instance;
    try {
        const result = await WebAssembly.instantiate(wasm, importObject);
        instance = result.instance;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Detect missing import module errors
        const moduleMatch = msg.match(/module "([^"]+)"/);
        if (moduleMatch) {
            const moduleName = moduleMatch[1]!;
            const available = Object.keys(limits.externalModules ?? {});
            return {
                output: JSON.stringify({
                    error: "missing_external_module",
                    module: moduleName,
                    availableModules: available,
                }),
                exitCode: 1,
            };
        }
        return {
            output: `WASM instantiation error: ${msg}`,
            exitCode: 1,
        };
    }
    state.instance = instance;

    // Phase 2: Instantiate deferred modules with Edict's shared memory
    if (needsSharedMemory.size > 0 && instance.exports.memory) {
        for (const namespace of needsSharedMemory) {
            const compiled = deferredModules.get(namespace)!;
            try {
                // Build shared imports dynamically from the module's actual import
                // declarations — no hardcoded namespace assumptions.
                const moduleImports = WebAssembly.Module.imports(compiled);
                const sharedImports: Record<string, Record<string, unknown>> = {};
                for (const imp of moduleImports) {
                    if (!sharedImports[imp.module]) sharedImports[imp.module] = {};
                    if (imp.kind === "memory") {
                        sharedImports[imp.module]![imp.name] = instance.exports.memory;
                    } else if (imp.kind === "function") {
                        // Forward Edict's heap allocator exports to the external module
                        const edictExport = instance.exports[imp.name];
                        if (edictExport) sharedImports[imp.module]![imp.name] = edictExport;
                    }
                }

                const extInstance = await WebAssembly.instantiate(compiled, sharedImports);
                // Patch delegates with real functions from shared-memory instance
                for (const [key, val] of Object.entries(extInstance.exports)) {
                    if (typeof val === "function") {
                        const ref = delegateRefs.get(`${namespace}.${key}`);
                        if (ref) ref.fn = val as (...args: unknown[]) => unknown;
                    }
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return {
                    output: JSON.stringify({
                        error: "shared_memory_init_failed",
                        module: namespace,
                        reason: msg,
                    }),
                    exitCode: 1,
                };
            }
        }
    }

    let returnValue: number | undefined;
    let exitCode = 0;

    try {
        const mainFn = instance.exports[entryFn] as
            | ((...args: unknown[]) => number)
            | undefined;

        if (!mainFn || typeof mainFn !== "function") {
            return {
                output: "",
                exitCode: 1,
            };
        }

        returnValue = mainFn();
    } catch (e) {
        // Heap bounds check failed — structured OOM error
        if (e instanceof EdictOomError) {
            return {
                output: state.outputParts.join(""),
                exitCode: 1,
                error: "execution_oom",
                limitInfo: { maxMemoryMb: Math.round(e.heapLimit / 1048576) },
            };
        }
        const msg = e instanceof Error ? e.message : String(e);
        // Handle edict_exit:N — clean process exit, not an error
        const exitMatch = msg.match(/^edict_exit:(\d+)$/);
        if (exitMatch) {
            exitCode = parseInt(exitMatch[1]!, 10);
        } else {
            state.outputParts.push(`Runtime error: ${msg}`);
            exitCode = 1;
        }
    }

    // Read heap usage after execution (zero-cost — one WASM global read)
    const heapUsed = state.instance ? getHeapUsage(state).used : undefined;

    return {
        output: state.outputParts.join(""),
        exitCode,
        returnValue,
        ...(heapUsed !== undefined && heapUsed > 0 ? { heapUsed } : {}),
        // Attach replay token when recording
        ...(limits.record && !limits.replayToken ? {
            replayToken: {
                responses: [...adapterEntries, ...builtinEntries],
                recordedAt: new Date().toISOString(),
            },
        } : {}),
    };
}

// =============================================================================
// Debug execution — call stack tracking and crash diagnostics
// =============================================================================

import type { DebugMetadata } from "./types.js";
import { readString } from "../builtins/host-helpers.js";

/** Result from debug execution — includes crash diagnostics and trace info */
export interface DebugResult {
    /** Captured stdout output */
    output: string;
    /** Exit code (0 = success) */
    exitCode: number;
    /** Return value from main (if any) */
    returnValue?: number;
    /** Call stack at crash time (function names, outermost first) */
    callStack?: string[];
    /** Crash location — mapped from debug metadata */
    crashLocation?: { fn: string; nodeId: string };
    /** Number of function entries recorded */
    stepsExecuted: number;
    /** Error type, if execution was killed */
    error?: "execution_timeout" | "execution_oom" | "step_limit_exceeded";
}

/** Options for debug execution */
export interface DebugOptions {
    /** Maximum number of function entries before stopping (default: 10_000) */
    maxSteps?: number;
    /** Sandbox directory for file IO builtins */
    sandboxDir?: string;
    /** Optional list of allowed hostnames for HTTP requests. */
    allowedHosts?: string[];
    /** Optional host adapter */
    adapter?: EdictHostAdapter;
}

/** Thrown when step limit is exceeded during debug execution */
class StepLimitError extends Error {
    constructor(public stepsExecuted: number) {
        super("step_limit_exceeded");
    }
}

/**
 * Execute a debug-instrumented WASM binary with call stack tracking.
 *
 * Must be compiled with `debugMode: true` so the WASM contains
 * `__trace_enter` / `__trace_exit` calls.
 *
 * @param wasm - The WASM binary (compiled with debugMode: true)
 * @param debugMetadata - fnName→nodeId mapping from compile result
 * @param options - Debug execution options (maxSteps, sandboxDir)
 */
export async function runDebug(
    wasm: Uint8Array,
    debugMetadata: DebugMetadata,
    options: DebugOptions = {},
): Promise<DebugResult> {
    const maxSteps = options.maxSteps ?? 10_000;
    const callStack: string[] = [];
    let stepsExecuted = 0;

    const state: RuntimeState = {
        outputParts: [],
        instance: null,
        sandboxDir: options.sandboxDir,
        allowedHosts: options.allowedHosts,
    };
    const importObject = createHostImports(state, options.adapter);

    const decoder = new TextDecoder();

    // Add debug host functions that track the call stack
    importObject["debug"] = {
        __trace_enter: (fnNamePtr: number) => {
            stepsExecuted++;
            if (stepsExecuted > maxSteps) {
                throw new StepLimitError(stepsExecuted);
            }
            const fnName = readString(state, fnNamePtr, decoder);
            callStack.push(fnName);
        },
        __trace_exit: (fnNamePtr: number) => {
            const fnName = readString(state, fnNamePtr, decoder);
            // Pop matching fn from stack (handles normal exits)
            const idx = callStack.lastIndexOf(fnName);
            if (idx !== -1) {
                callStack.splice(idx, 1);
            }
        },
    };

    const { instance } = await WebAssembly.instantiate(wasm, importObject);
    state.instance = instance;

    let returnValue: number | undefined;
    let exitCode = 0;

    try {
        const mainFn = instance.exports["main"] as
            | ((...args: unknown[]) => number)
            | undefined;

        if (!mainFn || typeof mainFn !== "function") {
            return {
                output: "",
                exitCode: 1,
                stepsExecuted: 0,
            };
        }

        returnValue = mainFn();
    } catch (e) {
        // Step limit exceeded
        if (e instanceof StepLimitError) {
            const topFn = callStack.length > 0 ? callStack[callStack.length - 1]! : undefined;
            return {
                output: state.outputParts.join(""),
                exitCode: 1,
                callStack: [...callStack],
                crashLocation: topFn ? {
                    fn: topFn,
                    nodeId: debugMetadata.fnMap[topFn] ?? "unknown",
                } : undefined,
                stepsExecuted,
                error: "step_limit_exceeded",
            };
        }

        // Heap OOM
        if (e instanceof EdictOomError) {
            const topFn = callStack.length > 0 ? callStack[callStack.length - 1]! : undefined;
            return {
                output: state.outputParts.join(""),
                exitCode: 1,
                callStack: [...callStack],
                crashLocation: topFn ? {
                    fn: topFn,
                    nodeId: debugMetadata.fnMap[topFn] ?? "unknown",
                } : undefined,
                stepsExecuted,
                error: "execution_oom",
            };
        }

        const msg = e instanceof Error ? e.message : String(e);
        // Handle edict_exit:N — clean process exit
        const exitMatch = msg.match(/^edict_exit:(\d+)$/);
        if (exitMatch) {
            exitCode = parseInt(exitMatch[1]!, 10);
        } else {
            // Runtime error (WASM trap, division by zero, etc.)
            const topFn = callStack.length > 0 ? callStack[callStack.length - 1]! : undefined;
            return {
                output: state.outputParts.join("") + `Runtime error: ${msg}`,
                exitCode: 1,
                callStack: [...callStack],
                crashLocation: topFn ? {
                    fn: topFn,
                    nodeId: debugMetadata.fnMap[topFn] ?? "unknown",
                } : undefined,
                stepsExecuted,
            };
        }
    }

    return {
        output: state.outputParts.join(""),
        exitCode,
        returnValue,
        stepsExecuted,
    };
}
