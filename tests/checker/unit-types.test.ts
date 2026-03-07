// =============================================================================
// Semantic Unit Types — Tests (Issue #28)
// =============================================================================
// Covers: type checker enforcement, codegen erasure, structured errors

import { describe, it, expect } from "vitest";
import { validate } from "../../src/validator/validate.js";
import { resolve } from "../../src/resolver/resolve.js";
import { typeCheck } from "../../src/checker/check.js";
import { compile } from "../../src/codegen/codegen.js";
import type { EdictModule, FunctionDef, Expression, Param } from "../../src/ast/nodes.js";
import type { TypeExpr, UnitType } from "../../src/ast/types.js";

// =============================================================================
// Helpers
// =============================================================================

const INT_TYPE: TypeExpr = { kind: "basic", name: "Int" };
const FLOAT_TYPE: TypeExpr = { kind: "basic", name: "Float" };
const BOOL_TYPE: TypeExpr = { kind: "basic", name: "Bool" };
const USD: UnitType = { kind: "unit_type", base: "Int", unit: "usd" };
const EUR: UnitType = { kind: "unit_type", base: "Int", unit: "eur" };
const CELSIUS: UnitType = { kind: "unit_type", base: "Float", unit: "celsius" };
const METERS: UnitType = { kind: "unit_type", base: "Float", unit: "meters" };
const METERS_INT: UnitType = { kind: "unit_type", base: "Int", unit: "meters" };

function mod(defs: EdictModule["definitions"]): EdictModule {
    return { kind: "module", id: "mod-test-001", name: "test", imports: [], definitions: defs };
}

function param(name: string, type: TypeExpr, id = `param-${name}-001`): Param {
    return { kind: "param", id, name, type };
}

function ident(name: string, id = `id-${name}-001`): Expression {
    return { kind: "ident", id, name };
}

function binop(op: string, left: Expression, right: Expression, id = "binop-001"): Expression {
    return { kind: "binop", id, op: op as any, left, right };
}

function unop(op: string, operand: Expression, id = "unop-001"): Expression {
    return { kind: "unop", id, op: op as any, operand };
}

function fn(
    name: string,
    params: Param[],
    body: Expression[],
    returnType: TypeExpr = INT_TYPE,
    effects: FunctionDef["effects"] = ["pure"],
    id = `fn-${name}-001`,
): FunctionDef {
    return { kind: "fn", id, name, params, returnType, effects, contracts: [], body };
}

function checkModule(m: EdictModule) {
    const vr = validate(m);
    if (!vr.ok) return { errors: vr.errors };
    const re = resolve(m);
    if (re.length > 0) return { errors: re };
    const tc = typeCheck(m);
    return tc;
}

// =============================================================================
// Type Checker — Unit compatibility enforcement
// =============================================================================

describe("unit types — checker", () => {
    describe("same-unit arithmetic (valid)", () => {
        const ops = ["+", "-", "*", "/", "%"] as const;

        for (const op of ops) {
            it(`${op}: same unit passes type check`, () => {
                const m = mod([
                    fn("main", [
                        param("a", USD),
                        param("b", USD),
                    ], [
                        binop(op, ident("a"), ident("b")),
                    ], USD),
                ]);
                const result = checkModule(m);
                expect(result.errors).toHaveLength(0);
            });
        }

        it("Float-based units: same unit passes", () => {
            const m = mod([
                fn("calc", [
                    param("a", CELSIUS),
                    param("b", CELSIUS),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], CELSIUS),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("different-unit arithmetic (rejected)", () => {
        it("usd + eur → unit_mismatch", () => {
            const m = mod([
                fn("main", [
                    param("a", USD),
                    param("b", EUR),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], USD),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
            const err = result.errors[0] as any;
            expect(err.error).toBe("unit_mismatch");
            expect(err.expectedUnit).toBe("usd");
            expect(err.actualUnit).toBe("eur");
            expect(err.expectedBase).toBe("Int");
            expect(err.actualBase).toBe("Int");
        });

        it("usd - celsius → unit_mismatch", () => {
            const m = mod([
                fn("main", [
                    param("a", USD),
                    param("b", { kind: "unit_type", base: "Int", unit: "celsius" }),
                ], [
                    binop("-", ident("a"), ident("b")),
                ], USD),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toHaveProperty("error", "unit_mismatch");
        });

        it("different bases: Int<meters> + Float<meters> → unit_mismatch", () => {
            const m = mod([
                fn("main", [
                    param("a", METERS_INT),
                    param("b", METERS),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], METERS),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
            const err = result.errors[0] as any;
            expect(err.error).toBe("unit_mismatch");
            expect(err.expectedBase).toBe("Int");
            expect(err.actualBase).toBe("Float");
        });

        for (const op of ["*", "/", "%"] as const) {
            it(`${op}: different units → unit_mismatch`, () => {
                const m = mod([
                    fn("main", [
                        param("a", USD),
                        param("b", EUR),
                    ], [
                        binop(op, ident("a"), ident("b")),
                    ], USD),
                ]);
                const result = checkModule(m);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors[0]).toHaveProperty("error", "unit_mismatch");
            });
        }
    });

    describe("unit vs bare type (rejected)", () => {
        it("Int<usd> + Int → type_mismatch", () => {
            const m = mod([
                fn("main", [
                    param("a", USD),
                    param("b", INT_TYPE),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], INT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
            // This is type_mismatch (not unit_mismatch) because one side is not a unit_type
            expect(result.errors[0]).toHaveProperty("error", "type_mismatch");
        });
    });

    describe("comparison operators", () => {
        it("same unit comparison → Bool", () => {
            const m = mod([
                fn("main", [
                    param("a", USD),
                    param("b", USD),
                ], [
                    binop("==", ident("a"), ident("b")),
                ], BOOL_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("different unit comparison → unit_mismatch", () => {
            const m = mod([
                fn("main", [
                    param("a", USD),
                    param("b", EUR),
                ], [
                    binop("<", ident("a"), ident("b")),
                ], BOOL_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toHaveProperty("error", "unit_mismatch");
        });
    });

    describe("unary operators", () => {
        it("unary negation preserves unit type", () => {
            const m = mod([
                fn("main", [
                    param("a", USD),
                ], [
                    unop("-", ident("a")),
                ], USD),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("function boundaries", () => {
        it("unit type as return type: correct unit passes", () => {
            const m = mod([
                fn("double", [
                    param("x", USD),
                ], [
                    binop("+", ident("x"), ident("x", "id-x-002")),
                ], USD),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("unit type as return type: wrong unit fails", () => {
            const m = mod([
                fn("convert", [
                    param("x", EUR),
                ], [
                    ident("x"),
                ], USD), // declared return USD but returns EUR
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });
});

// =============================================================================
// Validator — unit_type structural validation
// =============================================================================

describe("unit types — validator", () => {
    it("valid unit type passes validation", () => {
        const m = mod([
            fn("main", [
                param("a", USD),
            ], [
                ident("a"),
            ], USD),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });

    it("invalid base type fails validation", () => {
        const m = mod([
            fn("main", [
                param("a", { kind: "unit_type", base: "String" as any, unit: "usd" }),
            ], [
                ident("a"),
            ], INT_TYPE),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(false);
    });
});

// =============================================================================
// Codegen — unit type erasure
// =============================================================================

describe("unit types — codegen erasure", () => {
    it("Int-based unit type compiles correctly", () => {
        const m = mod([
            fn("add_prices", [
                param("a", USD),
                param("b", USD),
            ], [
                binop("+", ident("a"), ident("b")),
            ], USD, ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        resolve(m);
        const tc = typeCheck(m);
        expect(tc.errors).toHaveLength(0);

        const cr = compile(m, { typeInfo: tc.typeInfo });
        expect(cr.ok).toBe(true);
    });

    it("Float-based unit type compiles correctly", () => {
        const m = mod([
            fn("temp_diff", [
                param("a", CELSIUS),
                param("b", CELSIUS),
            ], [
                binop("-", ident("a"), ident("b")),
            ], CELSIUS, ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        resolve(m);
        const tc = typeCheck(m);
        expect(tc.errors).toHaveLength(0);

        const cr = compile(m, { typeInfo: tc.typeInfo });
        expect(cr.ok).toBe(true);
    });
});
