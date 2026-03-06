// =============================================================================
// Math domain — abs, min, max, pow, sqrt, floor, ceil, round
// =============================================================================

import type { BuiltinDef } from "../builtin-types.js";
import { INT_TYPE, FLOAT_TYPE } from "../../ast/type-constants.js";

export const MATH_BUILTINS: BuiltinDef[] = [
    {
        name: "abs",
        type: { kind: "fn_type", params: [INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (x: number): number => Math.abs(x) },
    },
    {
        name: "min",
        type: { kind: "fn_type", params: [INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (a: number, b: number): number => Math.min(a, b) },
    },
    {
        name: "max",
        type: { kind: "fn_type", params: [INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (a: number, b: number): number => Math.max(a, b) },
    },
    {
        name: "pow",
        type: { kind: "fn_type", params: [INT_TYPE, INT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (base: number, exp: number): number => (Math.pow(base, exp) | 0) },
    },
    {
        name: "sqrt",
        type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: FLOAT_TYPE },
        impl: { kind: "host", factory: () => (x: number): number => Math.sqrt(x) },
    },
    {
        name: "floor",
        type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (x: number): number => (Math.floor(x) | 0) },
    },
    {
        name: "ceil",
        type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (x: number): number => (Math.ceil(x) | 0) },
    },
    {
        name: "round",
        type: { kind: "fn_type", params: [FLOAT_TYPE], effects: ["pure"], returnType: INT_TYPE },
        impl: { kind: "host", factory: () => (x: number): number => (Math.round(x) | 0) },
    },
];
