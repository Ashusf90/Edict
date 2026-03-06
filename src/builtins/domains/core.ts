// =============================================================================
// Core domain — print, string_replace
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { STRING_TYPE } from "../../ast/type-constants.js";
import { getMemoryBuffer, writeStringResult, type HostContext } from "../host-helpers.js";

export const CORE_BUILTINS: BuiltinDef[] = [
    {
        name: "print",
        type: {
            kind: "fn_type",
            params: [STRING_TYPE],
            effects: ["io"],
            returnType: STRING_TYPE,
        },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number): number => {
                const bytes = new Uint8Array(getMemoryBuffer(ctx.state), ptr, len);
                const text = ctx.decoder.decode(bytes);
                ctx.state.outputParts.push(text);
                return ptr;
            },
        },
    },
    {
        name: "string_replace",
        type: {
            kind: "fn_type",
            params: [STRING_TYPE, STRING_TYPE, STRING_TYPE],
            effects: ["pure"],
            returnType: STRING_TYPE,
        },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (
                hayPtr: number, hayLen: number,
                needlePtr: number, needleLen: number,
                replPtr: number, replLen: number,
            ): number => {
                const memoryBuffer = getMemoryBuffer(ctx.state);
                const haystack = ctx.decoder.decode(new Uint8Array(memoryBuffer, hayPtr, hayLen));
                const needle = ctx.decoder.decode(new Uint8Array(memoryBuffer, needlePtr, needleLen));
                const replacement = ctx.decoder.decode(new Uint8Array(memoryBuffer, replPtr, replLen));
                return writeStringResult(ctx.state, haystack.replaceAll(needle, replacement), ctx.encoder);
            },
        },
    },
];
