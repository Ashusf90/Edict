// =============================================================================
// Random domain — randomInt, randomFloat, randomUuid
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { INT_TYPE, FLOAT_TYPE, STRING_TYPE } from "../../ast/type-constants.js";
import { writeStringResult, type HostContext } from "../host-helpers.js";

export const RANDOM_BUILTINS: BuiltinDef[] = [
    {
        name: "randomInt",
        type: { kind: "fn_type", params: [INT_TYPE, INT_TYPE], effects: ["reads"], returnType: INT_TYPE },
        nondeterministic: true,
        provenance: "io:random",
        impl: {
            kind: "host",
            factory: () => (min: number, max: number): number => {
                // Inclusive range [min, max] with rejection sampling to avoid modulo bias
                const range = max - min + 1;
                const limit = 0x100000000 - (0x100000000 % range); // largest multiple of range ≤ 2^32
                const array = new Uint32Array(1);
                let val: number;
                do {
                    crypto.getRandomValues(array);
                    val = array[0]!;
                } while (val >= limit);
                return min + (val % range);
            },
        },
    },
    {
        name: "randomFloat",
        type: { kind: "fn_type", params: [], effects: ["reads"], returnType: FLOAT_TYPE },
        nondeterministic: true,
        provenance: "io:random",
        impl: {
            kind: "host",
            factory: () => (): number => {
                const array = new Uint32Array(1);
                crypto.getRandomValues(array);
                return array[0]! / 0x100000000; // [0, 1) — divide by 2^32
            },
        },
    },
    {
        name: "randomUuid",
        type: { kind: "fn_type", params: [], effects: ["reads"], returnType: STRING_TYPE },
        nondeterministic: true,
        provenance: "io:random",
        impl: {
            kind: "host",
            factory: (ctx: HostContext) => (): number => {
                const uuid = crypto.randomUUID();
                return writeStringResult(ctx.state, uuid, ctx.encoder);
            },
        },
    },
];

