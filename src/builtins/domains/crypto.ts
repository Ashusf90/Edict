// =============================================================================
// Crypto domain — sha256, md5, hmac (adapter-delegated)
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { STRING_TYPE } from "../../ast/type-constants.js";
import { getMemoryBuffer, writeStringResult, type HostContext } from "../host-helpers.js";

export const CRYPTO_BUILTINS: BuiltinDef[] = [
    {
        name: "sha256",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number): number => {
                const str = ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
                return writeStringResult(ctx.state, ctx.adapter.sha256(str), ctx.encoder);
            },
        },
    },
    {
        name: "md5",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number): number => {
                const str = ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
                return writeStringResult(ctx.state, ctx.adapter.md5(str), ctx.encoder);
            },
        },
    },
    {
        name: "hmac",
        type: {
            kind: "fn_type",
            params: [STRING_TYPE, STRING_TYPE, STRING_TYPE],
            effects: ["pure"],
            returnType: STRING_TYPE,
        },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (
                algoPtr: number, algoLen: number,
                keyPtr: number, keyLen: number,
                dataPtr: number, dataLen: number,
            ): number => {
                const buf = getMemoryBuffer(ctx.state);
                const algo = ctx.decoder.decode(new Uint8Array(buf, algoPtr, algoLen));
                const key = ctx.decoder.decode(new Uint8Array(buf, keyPtr, keyLen));
                const data = ctx.decoder.decode(new Uint8Array(buf, dataPtr, dataLen));
                return writeStringResult(ctx.state, ctx.adapter.hmac(algo, key, data), ctx.encoder);
            },
        },
    },
];
