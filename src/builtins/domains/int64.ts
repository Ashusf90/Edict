// =============================================================================
// Int64 domain — intToInt64, int64ToInt, int64ToFloat, int64ToString
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { INT_TYPE, INT64_TYPE, FLOAT_TYPE, STRING_TYPE } from "../../ast/type-constants.js";
import { writeStringResult, type HostContext } from "../host-helpers.js";

export const INT64_BUILTINS: BuiltinDef[] = [
    {
        name: "intToInt64",
        type: { kind: "fn_type", params: [INT_TYPE], effects: ["pure"], returnType: INT64_TYPE },
        impl: { kind: "host", factory: () => (x: number): bigint => BigInt(x) },
    },
    {
        name: "int64ToInt",
        type: { kind: "fn_type", params: [INT64_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (x: bigint): number => Number(BigInt.asIntN(32, x)) },
    },
    {
        name: "int64ToFloat",
        type: { kind: "fn_type", params: [INT64_TYPE], effects: ["pure"], returnType: FLOAT_TYPE },
        impl: { kind: "host", factory: () => (x: bigint): number => Number(x) },
    },
    {
        name: "int64ToString",
        type: { kind: "fn_type", params: [INT64_TYPE], effects: ["pure"], returnType: STRING_TYPE },
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (x: bigint): number =>
                writeStringResult(ctx.state, x.toString(), ctx.encoder),
        },
    },
];
