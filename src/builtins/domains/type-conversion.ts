// =============================================================================
// Type conversion domain — intToString, floatToString, boolToString, etc.
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { INT_TYPE, FLOAT_TYPE, STRING_TYPE, BOOL_TYPE } from "../../ast/type-constants.js";
import { writeStringResult, type HostContext } from "../host-helpers.js";

export const TYPE_CONVERSION_BUILTINS: BuiltinDef[] = [
    {
        name: "intToString",
        type: { kind: "fn_type", params: [INT_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (value: number): number =>
                writeStringResult(ctx.state, String(value), ctx.encoder),
        },
    },
    {
        name: "floatToString",
        type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (value: number): number =>
                writeStringResult(ctx.state, String(value), ctx.encoder),
        },
    },
    {
        name: "boolToString",
        type: { kind: "fn_type", params: [BOOL_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (value: number): number =>
                writeStringResult(ctx.state, value ? "true" : "false", ctx.encoder),
        },
    },
    {
        name: "floatToInt",
        type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (value: number): number => (Math.trunc(value) | 0) },
    },
    {
        name: "intToFloat",
        type: { kind: "fn_type", params: [INT_TYPE], effects: ["pure"], returnType: FLOAT_TYPE },
        impl: { kind: "host", factory: () => (value: number): number => value },
    },
];
