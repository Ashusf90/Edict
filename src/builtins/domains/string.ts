// =============================================================================
// String domain — string_length, substring, string_concat, etc.
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { INT_TYPE, STRING_TYPE, BOOL_TYPE } from "../../ast/type-constants.js";
import { getMemoryBuffer, writeStringResult, type HostContext } from "../host-helpers.js";

export const STRING_BUILTINS: BuiltinDef[] = [
    {
        name: "string_length",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number): number => {
                const str = ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
                return str.length;
            },
        },
    },
    {
        name: "substring",
        type: { kind: "fn_type", params: [STRING_TYPE, INT_TYPE, INT_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number, start: number, end: number): number => {
                const str = ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
                return writeStringResult(ctx.state, str.substring(start, end), ctx.encoder);
            },
        },
    },
    {
        name: "string_concat",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (aPtr: number, aLen: number, bPtr: number, bLen: number): number => {
                const buf = getMemoryBuffer(ctx.state);
                const a = ctx.decoder.decode(new Uint8Array(buf, aPtr, aLen));
                const b = ctx.decoder.decode(new Uint8Array(buf, bPtr, bLen));
                return writeStringResult(ctx.state, a + b, ctx.encoder);
            },
        },
    },
    {
        name: "string_indexOf",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (hayPtr: number, hayLen: number, needlePtr: number, needleLen: number): number => {
                const buf = getMemoryBuffer(ctx.state);
                const haystack = ctx.decoder.decode(new Uint8Array(buf, hayPtr, hayLen));
                const needle = ctx.decoder.decode(new Uint8Array(buf, needlePtr, needleLen));
                return haystack.indexOf(needle);
            },
        },
    },
    {
        name: "toUpperCase",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number): number => {
                const str = ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
                return writeStringResult(ctx.state, str.toUpperCase(), ctx.encoder);
            },
        },
    },
    {
        name: "toLowerCase",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number): number => {
                const str = ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
                return writeStringResult(ctx.state, str.toLowerCase(), ctx.encoder);
            },
        },
    },
    {
        name: "string_trim",
        type: { kind: "fn_type", params: [STRING_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number): number => {
                const str = ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
                return writeStringResult(ctx.state, str.trim(), ctx.encoder);
            },
        },
    },
    {
        name: "string_startsWith",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["pure"], returnType: BOOL_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (strPtr: number, strLen: number, prefixPtr: number, prefixLen: number): number => {
                const buf = getMemoryBuffer(ctx.state);
                const str = ctx.decoder.decode(new Uint8Array(buf, strPtr, strLen));
                const prefix = ctx.decoder.decode(new Uint8Array(buf, prefixPtr, prefixLen));
                return str.startsWith(prefix) ? 1 : 0;
            },
        },
    },
    {
        name: "string_endsWith",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["pure"], returnType: BOOL_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (strPtr: number, strLen: number, suffixPtr: number, suffixLen: number): number => {
                const buf = getMemoryBuffer(ctx.state);
                const str = ctx.decoder.decode(new Uint8Array(buf, strPtr, strLen));
                const suffix = ctx.decoder.decode(new Uint8Array(buf, suffixPtr, suffixLen));
                return str.endsWith(suffix) ? 1 : 0;
            },
        },
    },
    {
        name: "string_contains",
        type: { kind: "fn_type", params: [STRING_TYPE, STRING_TYPE], effects: ["pure"], returnType: BOOL_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (hayPtr: number, hayLen: number, needlePtr: number, needleLen: number): number => {
                const buf = getMemoryBuffer(ctx.state);
                const haystack = ctx.decoder.decode(new Uint8Array(buf, hayPtr, hayLen));
                const needle = ctx.decoder.decode(new Uint8Array(buf, needlePtr, needleLen));
                return haystack.includes(needle) ? 1 : 0;
            },
        },
    },
    {
        name: "string_repeat",
        type: { kind: "fn_type", params: [STRING_TYPE, INT_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (ptr: number, len: number, count: number): number => {
                const str = ctx.decoder.decode(new Uint8Array(getMemoryBuffer(ctx.state), ptr, len));
                return writeStringResult(ctx.state, str.repeat(count), ctx.encoder);
            },
        },
    },
];
