// =============================================================================
// Builtin Registry — single source of truth for all Edict builtins
// =============================================================================
// Each builtin's type signature and implementation are co-located in domain
// files under src/builtins/domains/. This registry composes all domains and
// derives the BUILTIN_FUNCTIONS map, host imports, and WASM generators.
//
// Adding a new builtin:
//   1. Add a BuiltinDef entry to the appropriate domain file
//   2. That's it — registry derives everything else automatically

import type { FunctionType } from "../ast/types.js";
import type { EdictHostAdapter } from "../codegen/host-adapter.js";
import { NodeHostAdapter } from "../codegen/node-host-adapter.js";
import type { RuntimeState, HostContext } from "./host-helpers.js";
import type binaryen from "binaryen";

import type { ReplayEntry } from "../codegen/replay-types.js";

// Re-export types so consumers can import from registry or builtin-types
export type { BuiltinDef, BuiltinImpl } from "./builtin-types.js";
import type { BuiltinDef } from "./builtin-types.js";

// ── Domain imports ──────────────────────────────────────────────────────────

import { CORE_BUILTINS } from "./domains/core.js";
import { STRING_BUILTINS } from "./domains/string.js";
import { MATH_BUILTINS } from "./domains/math.js";
import { TYPE_CONVERSION_BUILTINS } from "./domains/type-conversion.js";
import { INT64_BUILTINS } from "./domains/int64.js";
import { ARRAY_BUILTINS } from "./domains/array.js";
import { OPTION_BUILTINS } from "./domains/option.js";
import { RESULT_BUILTINS } from "./domains/result.js";
import { JSON_BUILTINS } from "./domains/json.js";
import { RANDOM_BUILTINS } from "./domains/random.js";
import { DATETIME_BUILTINS } from "./domains/datetime.js";
import { REGEX_BUILTINS } from "./domains/regex.js";
import { CRYPTO_BUILTINS } from "./domains/crypto.js";
import { HTTP_BUILTINS } from "./domains/http.js";
import { IO_BUILTINS } from "./domains/io.js";



/**
 * Backward-compatible builtin interface — same shape as the old BuiltinFunction.
 * Used by resolver, checker, codegen, etc.
 */
export interface BuiltinFunction {
    /** Edict-level function type signature (includes effects, params, returnType) */
    type: FunctionType;
    /** WASM import: [module, base] names */
    wasmImport: [string, string];
}

// =============================================================================
// Registry composition
// =============================================================================

/** All builtins from all domains, composed in one flat array. */
export const ALL_BUILTINS: readonly BuiltinDef[] = [
    ...CORE_BUILTINS,
    ...STRING_BUILTINS,
    ...MATH_BUILTINS,
    ...TYPE_CONVERSION_BUILTINS,
    ...INT64_BUILTINS,
    ...ARRAY_BUILTINS,
    ...OPTION_BUILTINS,
    ...RESULT_BUILTINS,
    ...JSON_BUILTINS,
    ...RANDOM_BUILTINS,
    ...DATETIME_BUILTINS,
    ...REGEX_BUILTINS,
    ...CRYPTO_BUILTINS,
    ...HTTP_BUILTINS,
    ...IO_BUILTINS,
];

// =============================================================================
// Derived maps
// =============================================================================

/** Derive the WASM import path from the implementation kind. */
function deriveWasmImport(def: BuiltinDef): [string, string] {
    return def.impl.kind === "host"
        ? ["host", def.name]
        : ["__wasm", def.name];
}

/**
 * Backward-compatible builtin function map — derived from the registry.
 * Same API as the old BUILTIN_FUNCTIONS in builtins.ts.
 */
export const BUILTIN_FUNCTIONS: ReadonlyMap<string, BuiltinFunction> = new Map(
    ALL_BUILTINS.map(b => [b.name, { type: b.type, wasmImport: deriveWasmImport(b) }])
);

/**
 * Check if a name refers to a built-in function.
 */
export function isBuiltin(name: string): boolean {
    return BUILTIN_FUNCTIONS.has(name);
}

/**
 * Get the built-in function definition, or undefined.
 */
export function getBuiltin(name: string): BuiltinFunction | undefined {
    return BUILTIN_FUNCTIONS.get(name);
}

// =============================================================================
// Replay log mode — controls record/replay behavior for nondeterministic builtins
// =============================================================================

/** Record mode: log nondeterministic host calls. */
export type ReplayLogRecord = { mode: "record"; entries: ReplayEntry[] };
/** Replay mode: return pre-recorded values. */
export type ReplayLogReplay = { mode: "replay"; entries: ReplayEntry[]; cursor: { i: number } };
/** Combined replay log type. */
export type ReplayLog = ReplayLogRecord | ReplayLogReplay;

/**
 * Wrap a host function for record or replay mode.
 * - Record: calls the real function and logs the result.
 * - Replay: skips the real function and returns the recorded result.
 */
function wrapForReplay(name: string, fn: Function, log: ReplayLog): Function {
    if (log.mode === "record") {
        return (...args: unknown[]) => {
            const result = fn(...args);
            log.entries.push({ kind: name, args, result });
            return result;
        };
    } else {
        return (..._args: unknown[]) => {
            if (log.cursor.i >= log.entries.length) {
                throw new Error(`replay_token_exhausted: expected "${name}" at position ${log.cursor.i}`);
            }
            const entry = log.entries[log.cursor.i]!;
            log.cursor.i++;
            return entry.result;
        };
    }
}

// =============================================================================
// Host import factory — derives host imports from registry
// =============================================================================

/**
 * Create the complete host import object for WASM instantiation.
 * Iterates all host-kind builtins in the registry and builds a single
 * flat { host: { ... } } object.
 *
 * When a replayLog is provided, builtins tagged `nondeterministic: true`
 * are automatically wrapped to record or replay their calls.
 *
 * @param state — mutable runtime state shared across all host functions.
 *                `state.instance` must be set after `WebAssembly.instantiate()`
 *                but before calling any exported WASM function.
 * @param adapter — optional platform-specific adapter. Defaults to NodeHostAdapter.
 * @param replayLog — optional record/replay log for nondeterministic builtins.
 */
export function createHostImports(
    state: RuntimeState,
    adapter?: EdictHostAdapter,
    replayLog?: ReplayLog,
): Record<string, Record<string, unknown>> {
    const hostAdapter = adapter ?? new NodeHostAdapter(state.sandboxDir);
    const ctx: HostContext = {
        state,
        adapter: hostAdapter,
        encoder: new TextEncoder(),
        decoder: new TextDecoder(),
    };

    const hostFunctions: Record<string, unknown> = {};
    for (const def of ALL_BUILTINS) {
        if (def.impl.kind === "host") {
            let fn = def.impl.factory(ctx);
            // Auto-wrap nondeterministic builtins for record/replay
            if (def.nondeterministic && replayLog) {
                fn = wrapForReplay(def.name, fn, replayLog);
            }
            hostFunctions[def.name] = fn;
        }
    }

    return { host: hostFunctions };
}

// =============================================================================
// WASM builtin generator — runs all WASM-native generators from registry
// =============================================================================

/**
 * Generate all WASM-native builtin functions (HOFs) from the registry.
 * Called by codegen.ts after compiling user functions.
 */
export function generateWasmBuiltins(mod: binaryen.Module): void {
    for (const def of ALL_BUILTINS) {
        if (def.impl.kind === "wasm") {
            def.impl.generator(mod);
        }
    }
}
