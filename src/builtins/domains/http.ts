// =============================================================================
// HTTP domain — httpGet, httpPost, httpPut, httpDelete (adapter-delegated)
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { STRING_TYPE, RESULT_STRING_TYPE } from "../../ast/type-constants.js";
import { readString, writeStringResult, writeResultValue, type HostContext } from "../host-helpers.js";

function checkAllowedHost(ctx: HostContext, urlString: string): { allowed: boolean; errorData?: string } {
    if (!ctx.state.allowedHosts) {
        return { allowed: true };
    }
    try {
        const url = new URL(urlString);
        if (!ctx.state.allowedHosts.includes(url.hostname)) {
            return { allowed: false, errorData: "host_not_allowed" };
        }
        return { allowed: true };
    } catch {
        return { allowed: false, errorData: "host_not_allowed" };
    }
}

function makeResult(ctx: HostContext, fetchResult: { ok: boolean; data: string }): number {
    const strPtr = writeStringResult(ctx.state, fetchResult.data, ctx.encoder);
    return writeResultValue(ctx.state, fetchResult.ok ? 0 : 1, strPtr);
}

function fetchWithChecks(ctx: HostContext, urlPtr: number, method: "GET" | "POST" | "PUT" | "DELETE", bodyPtr?: number): number {
    const url = readString(ctx.state, urlPtr, ctx.decoder);
    const check = checkAllowedHost(ctx, url);
    if (!check.allowed) {
        return makeResult(ctx, { ok: false, data: check.errorData! });
    }
    const bodyStr = bodyPtr !== undefined ? readString(ctx.state, bodyPtr, ctx.decoder) : undefined;
    return makeResult(ctx, ctx.adapter.fetch(url, method, bodyStr));
}

export const HTTP_BUILTINS: BuiltinDef[] = [
    {
        name: "httpGet",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["io"], returnType: RESULT_STRING_TYPE },
        provenance: "io:http",
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (urlPtr: number): number => fetchWithChecks(ctx, urlPtr, "GET"),
        },
    },
    {
        name: "httpPost",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["io"], returnType: RESULT_STRING_TYPE },
        provenance: "io:http",
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (urlPtr: number, bodyPtr: number): number => fetchWithChecks(ctx, urlPtr, "POST", bodyPtr),
        },
    },
    {
        name: "httpPut",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["io"], returnType: RESULT_STRING_TYPE },
        provenance: "io:http",
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (urlPtr: number, bodyPtr: number): number => fetchWithChecks(ctx, urlPtr, "PUT", bodyPtr),
        },
    },
    {
        name: "httpDelete",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["io"], returnType: RESULT_STRING_TYPE },
        provenance: "io:http",
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (urlPtr: number): number => fetchWithChecks(ctx, urlPtr, "DELETE"),
        },
    },
];
