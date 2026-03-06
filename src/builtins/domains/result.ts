// =============================================================================
// Result domain — isOk, isErr, unwrapOk, unwrapErr, unwrapOkOr, unwrapErrOr
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { INT_TYPE, BOOL_TYPE, RESULT_INT_TYPE } from "../../ast/type-constants.js";
import { getMemoryBuffer, type HostContext } from "../host-helpers.js";

export const RESULT_BUILTINS: BuiltinDef[] = [
    {
        name: "isOk",
        type: { kind: "fn_type", params: [RESULT_INT_TYPE], effects: ["pure"], returnType: BOOL_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number): number => {
                return new DataView(getMemoryBuffer(ctx.state)).getInt32(ptr, true) === 0 ? 1 : 0;
            },
        },
    },
    {
        name: "isErr",
        type: { kind: "fn_type", params: [RESULT_INT_TYPE], effects: ["pure"], returnType: BOOL_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number): number => {
                return new DataView(getMemoryBuffer(ctx.state)).getInt32(ptr, true) === 1 ? 1 : 0;
            },
        },
    },
    {
        name: "unwrapOk",
        type: { kind: "fn_type", params: [RESULT_INT_TYPE], effects: ["fails"], returnType: INT_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number): number => {
                const view = new DataView(getMemoryBuffer(ctx.state));
                const tag = view.getInt32(ptr, true);
                if (tag === 0) return view.getInt32(ptr + 8, true);
                throw new Error("unwrapOk called on Err");
            },
        },
    },
    {
        name: "unwrapErr",
        type: { kind: "fn_type", params: [RESULT_INT_TYPE], effects: ["fails"], returnType: INT_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number): number => {
                const view = new DataView(getMemoryBuffer(ctx.state));
                const tag = view.getInt32(ptr, true);
                if (tag === 1) return view.getInt32(ptr + 8, true);
                throw new Error("unwrapErr called on Ok");
            },
        },
    },
    {
        name: "unwrapOkOr",
        type: { kind: "fn_type", params: [RESULT_INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, defaultVal: number): number => {
                const view = new DataView(getMemoryBuffer(ctx.state));
                const tag = view.getInt32(ptr, true);
                if (tag === 0) return view.getInt32(ptr + 8, true);
                return defaultVal;
            },
        },
    },
    {
        name: "unwrapErrOr",
        type: { kind: "fn_type", params: [RESULT_INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
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
