// =============================================================================
// Regex domain — regexTest, regexMatch, regexReplace
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { STRING_TYPE, BOOL_TYPE } from "../../ast/type-constants.js";
import { getMemoryBuffer, writeStringResult, type HostContext } from "../host-helpers.js";

export const REGEX_BUILTINS: BuiltinDef[] = [
    {
        name: "regexTest",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["pure"], returnType: BOOL_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (patPtr: number, patLen: number, inputPtr: number, inputLen: number): number => {
                const buf = getMemoryBuffer(ctx.state);
                const pattern = ctx.decoder.decode(new Uint8Array(buf, patPtr, patLen));
                const input = ctx.decoder.decode(new Uint8Array(buf, inputPtr, inputLen));
                try {
                    return new RegExp(pattern).test(input) ? 1 : 0;
                } catch {
                    return 0; // invalid regex → false
                }
            },
        },
    },
    {
        name: "regexMatch",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (patPtr: number, patLen: number, inputPtr: number, inputLen: number): number => {
                const buf = getMemoryBuffer(ctx.state);
                const pattern = ctx.decoder.decode(new Uint8Array(buf, patPtr, patLen));
                const input = ctx.decoder.decode(new Uint8Array(buf, inputPtr, inputLen));
                try {
                    const m = input.match(new RegExp(pattern));
                    return writeStringResult(ctx.state, m ? m[0]! : "", ctx.encoder);
                } catch {
                    return writeStringResult(ctx.state, "", ctx.encoder); // invalid regex → empty string
                }
            },
        },
    },
    {
        name: "regexReplace",
        type: {
            kind: "fn_type",
            params: [STRING_TYPE, STRING_TYPE, STRING_TYPE],
            effects: ["pure"],
            returnType: STRING_TYPE,
        },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (
                inputPtr: number, inputLen: number,
                patPtr: number, patLen: number,
                replPtr: number, replLen: number,
            ): number => {
                const buf = getMemoryBuffer(ctx.state);
                const input = ctx.decoder.decode(new Uint8Array(buf, inputPtr, inputLen));
                const pattern = ctx.decoder.decode(new Uint8Array(buf, patPtr, patLen));
                const replacement = ctx.decoder.decode(new Uint8Array(buf, replPtr, replLen));
                try {
                    return writeStringResult(ctx.state, input.replace(new RegExp(pattern, "g"), replacement), ctx.encoder);
                } catch {
                    return writeStringResult(ctx.state, input, ctx.encoder); // invalid regex → unchanged
                }
            },
        },
    },
];
