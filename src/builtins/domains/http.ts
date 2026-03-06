// =============================================================================
// HTTP domain — httpGet, httpPost, httpPut, httpDelete (adapter-delegated)
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { STRING_TYPE, RESULT_STRING_TYPE } from "../../ast/type-constants.js";
import { getMemoryBuffer, writeStringResult, writeResultValue, type HostContext } from "../host-helpers.js";

function readStr(ctx: HostContext, ptr: number, len: number): string {
    return ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
}

function makeResult(ctx: HostContext, fetchResult: { ok: boolean; data: string }): number {
    const strPtr = writeStringResult(ctx.state, fetchResult.data, ctx.encoder);
    return writeResultValue(ctx.state, fetchResult.ok ? 0 : 1, strPtr);
}

export const HTTP_BUILTINS: BuiltinDef[] = [
    {
        name: "httpGet",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["io"], returnType: RESULT_STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (urlPtr: number, urlLen: number): number => {
                return makeResult(ctx, ctx.adapter.fetch(readStr(ctx, urlPtr, urlLen), "GET"));
            },
        },
    },
    {
        name: "httpPost",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["io"], returnType: RESULT_STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (urlPtr: number, urlLen: number, bodyPtr: number, bodyLen: number): number => {
                return makeResult(ctx, ctx.adapter.fetch(readStr(ctx, urlPtr, urlLen), "POST", readStr(ctx, bodyPtr, bodyLen)));
            },
        },
    },
    {
        name: "httpPut",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["io"], returnType: RESULT_STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (urlPtr: number, urlLen: number, bodyPtr: number, bodyLen: number): number => {
                return makeResult(ctx, ctx.adapter.fetch(readStr(ctx, urlPtr, urlLen), "PUT", readStr(ctx, bodyPtr, bodyLen)));
            },
        },
    },
    {
        name: "httpDelete",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["io"], returnType: RESULT_STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (urlPtr: number, urlLen: number): number => {
                return makeResult(ctx, ctx.adapter.fetch(readStr(ctx, urlPtr, urlLen), "DELETE"));
            },
        },
    },
];
