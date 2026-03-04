// =============================================================================
// Builtins — Built-in functions available to all Edict programs
// =============================================================================
// These are not defined in user code. The resolver and type checker
// register them automatically. The codegen imports them from the host.

import type { TypeExpr, FunctionType } from "../ast/types.js";
import type { Effect } from "../ast/nodes.js";

export interface BuiltinFunction {
    /** Edict-level function type signature */
    type: FunctionType;
    /** Which effects this builtin performs */
    effects: Effect[];
    /** WASM import: [module, base] names */
    wasmImport: [string, string];
}

const STRING_TYPE: TypeExpr = { kind: "basic", name: "String" };
const INT_TYPE: TypeExpr = { kind: "basic", name: "Int" };
const FLOAT_TYPE: TypeExpr = { kind: "basic", name: "Float" };

/**
 * All built-in functions.
 *
 * `print` takes a String and returns a String (the value printed).
 * At the WASM level, it's imported as host.print(ptr, len) → ptr
 * (returns the same pointer for passthrough).
 */
export const BUILTIN_FUNCTIONS: ReadonlyMap<string, BuiltinFunction> = new Map([
    [
        "print",
        {
            type: {
                kind: "fn_type",
                params: [STRING_TYPE],
                effects: ["io"],
                returnType: STRING_TYPE,
            },
            effects: ["io"],
            wasmImport: ["host", "print"],
        },
    ],
    [
        "string_replace",
        {
            type: {
                kind: "fn_type",
                params: [STRING_TYPE, STRING_TYPE, STRING_TYPE],
                effects: ["pure"],
                returnType: STRING_TYPE,
            },
            effects: ["pure"],
            wasmImport: ["host", "string_replace"],
        },
    ],
    // =========================================================================
    // Math builtins — pure, no string handling needed
    // =========================================================================
    [
        "abs",
        {
            type: { kind: "fn_type", params: [INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
            effects: ["pure"],
            wasmImport: ["host", "abs"],
        },
    ],
    [
        "min",
        {
            type: { kind: "fn_type", params: [INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
            effects: ["pure"],
            wasmImport: ["host", "min"],
        },
    ],
    [
        "max",
        {
            type: { kind: "fn_type", params: [INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
            effects: ["pure"],
            wasmImport: ["host", "max"],
        },
    ],
    [
        "pow",
        {
            type: { kind: "fn_type", params: [INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
            effects: ["pure"],
            wasmImport: ["host", "pow"],
        },
    ],
    [
        "sqrt",
        {
            type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: FLOAT_TYPE },
            effects: ["pure"],
            wasmImport: ["host", "sqrt"],
        },
    ],
    [
        "floor",
        {
            type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: INT_TYPE },
            effects: ["pure"],
            wasmImport: ["host", "floor"],
        },
    ],
    [
        "ceil",
        {
            type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: INT_TYPE },
            effects: ["pure"],
            wasmImport: ["host", "ceil"],
        },
    ],
    [
        "round",
        {
            type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: INT_TYPE },
            effects: ["pure"],
            wasmImport: ["host", "round"],
        },
    ],
]);

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
