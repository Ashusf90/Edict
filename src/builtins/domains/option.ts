// =============================================================================
// Option domain — isSome, isNone, unwrap, unwrapOr
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { INT_TYPE, BOOL_TYPE, OPTION_INT_TYPE } from "../../ast/type-constants.js";
import { getMemoryBuffer, type HostContext } from "../host-helpers.js";

export const OPTION_BUILTINS: BuiltinDef[] = [
    {
        name: "isSome",
        type: { kind: "fn_type", params: [OPTION_INT_TYPE], effects: ["pure"], returnType: BOOL_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number): number => {
                return new DataView(getMemoryBuffer(ctx.state)).getInt32(ptr, true) === 1 ? 1 : 0;
            },
        },
    },
    {
        name: "isNone",
        type: { kind: "fn_type", params: [OPTION_INT_TYPE], effects: ["pure"], returnType: BOOL_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number): number => {
                return new DataView(getMemoryBuffer(ctx.state)).getInt32(ptr, true) === 0 ? 1 : 0;
            },
        },
    },
    {
        name: "unwrap",
        type: { kind: "fn_type", params: [OPTION_INT_TYPE], effects: ["fails"], returnType: INT_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number): number => {
                const view = new DataView(getMemoryBuffer(ctx.state));
                const tag = view.getInt32(ptr, true);
                if (tag === 1) return view.getInt32(ptr + 8, true);
                throw new Error("unwrap called on None");
            },
        },
    },
    {
        name: "unwrapOr",
        type: { kind: "fn_type", params: [OPTION_INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, defaultVal: number): number => {
                const view = new DataView(getMemoryBuffer(ctx.state));
                const tag = view.getInt32(ptr, true);
                if (tag === 1) return view.getInt32(ptr + 8, true);
                return defaultVal;
            },
        },
    },
];
