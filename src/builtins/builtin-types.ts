// =============================================================================
// Builtin type definitions — shared by registry and domain files
// =============================================================================
// Extracted to break the circular import between registry.ts ↔ domain files.

import type { FunctionType } from "../ast/types.js";
import type { HostContext } from "./host-helpers.js";
import type binaryen from "binaryen";

/** Co-located builtin definition — type signature + implementation together. */
export interface BuiltinDef {
    /** Builtin function name (e.g., "print", "array_map"). */
    name: string;
    /** Edict-level function type signature (includes effects, params, returnType). */
    type: FunctionType;
    /** Implementation: host-imported or WASM-native. */
    impl: BuiltinImpl;
}

export type BuiltinImpl =
    | { kind: "host"; factory: (ctx: HostContext) => Function }
    | { kind: "wasm"; generator: (mod: binaryen.Module) => void };
