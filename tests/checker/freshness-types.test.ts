// =============================================================================
// Freshness Types — Tests (Issue #71)
// =============================================================================
// Covers: type checker erasure, codegen erasure, lint warnings, structured errors

import { describe, it, expect } from "vitest";
import { validate } from "../../src/validator/validate.js";
import { resolve } from "../../src/resolver/resolve.js";
import { typeCheck } from "../../src/checker/check.js";
import { compile } from "../../src/codegen/codegen.js";
import { lint } from "../../src/lint/lint.js";
import type { EdictModule, FunctionDef, Expression, Param } from "../../src/ast/nodes.js";
import type { TypeExpr, FreshnessType } from "../../src/ast/types.js";

// =============================================================================
// Helpers
// =============================================================================

const INT_TYPE: TypeExpr = { kind: "basic", name: "Int" };
const FLOAT_TYPE: TypeExpr = { kind: "basic", name: "Float" };

function freshType(base: TypeExpr, maxAge: string): FreshnessType {
    return { kind: "fresh", base, maxAge };
}

function mod(defs: EdictModule["definitions"]): EdictModule {
    return {
        kind: "module",
        id: "mod-test-001",
        name: "test",
        imports: [],
        definitions: defs,
    };
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
// Validator — freshness type structural validation
// =============================================================================

describe("freshness types — validator", () => {
    it("valid freshness type passes validation", () => {
        const m = mod([
            fn("main", [
                param("price", freshType(INT_TYPE, "5m")),
            ], [
                ident("price"),
            ], INT_TYPE),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });

    it("freshness wrapping Float passes", () => {
        const m = mod([
            fn("main", [
                param("temp", freshType(FLOAT_TYPE, "30s")),
            ], [
                ident("temp"),
            ], FLOAT_TYPE),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });

    it("freshness wrapping array type passes", () => {
        const arrType: TypeExpr = { kind: "array", element: INT_TYPE };
        const m = mod([
            fn("main", [
                param("data", freshType(arrType, "1h")),
            ], [
                ident("data"),
            ], arrType),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });
});

// =============================================================================
// Type Checker — erasure and compatibility
// =============================================================================

describe("freshness types — checker", () => {
    describe("erasure — Fresh<T> compatible with T", () => {
        it("Fresh<Int, '5m'> assignable to Int return type", () => {
            const m = mod([
                fn("main", [
                    param("price", freshType(INT_TYPE, "5m")),
                ], [
                    ident("price"), // returns Fresh<Int, "5m">
                ], INT_TYPE),       // declared return Int
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("Int assignable to Fresh<Int, '5m'> return type", () => {
            const m = mod([
                fn("main", [
                    param("x", INT_TYPE),
                ], [
                    ident("x"),     // returns Int
                ], freshType(INT_TYPE, "5m")), // declared return Fresh<Int, "5m">
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("Fresh<Int, '5m'> compatible with Fresh<Int, '1h'> (different maxAge, same base)", () => {
            const m = mod([
                fn("main", [
                    param("a", freshType(INT_TYPE, "5m")),
                ], [
                    ident("a"),
                ], freshType(INT_TYPE, "1h")), // different maxAge, same base
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("incompatibility — different base types", () => {
        it("Fresh<Int, '5m'> not compatible with Float", () => {
            const m = mod([
                fn("main", [
                    param("a", freshType(INT_TYPE, "5m")),
                ], [
                    ident("a"),
                ], FLOAT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toHaveProperty("error", "type_mismatch");
        });

        it("Fresh<Int, '5m'> not compatible with Fresh<Float, '5m'>", () => {
            const m = mod([
                fn("main", [
                    param("a", freshType(INT_TYPE, "5m")),
                ], [
                    ident("a"),
                ], freshType(FLOAT_TYPE, "5m")),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe("arithmetic with freshness types", () => {
        it("same-base fresh values can add", () => {
            const m = mod([
                fn("main", [
                    param("a", freshType(INT_TYPE, "5m")),
                    param("b", freshType(INT_TYPE, "10m")),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], INT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("fresh value and bare value can add (erasure)", () => {
            const m = mod([
                fn("main", [
                    param("a", freshType(INT_TYPE, "5m")),
                    param("b", INT_TYPE),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], INT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("nested freshness types", () => {
        it("nested Fresh<Fresh<Int, '5m'>, '10m'> erases to Int", () => {
            const m = mod([
                fn("main", [
                    param("a", freshType(freshType(INT_TYPE, "5m"), "10m")),
                ], [
                    ident("a"),
                ], INT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });
});

// =============================================================================
// Codegen — freshness type erasure
// =============================================================================

describe("freshness types — codegen erasure", () => {
    it("Int-based freshness type compiles correctly", () => {
        const m = mod([
            fn("add_prices", [
                param("a", freshType(INT_TYPE, "5m")),
                param("b", freshType(INT_TYPE, "10m")),
            ], [
                binop("+", ident("a"), ident("b")),
            ], INT_TYPE, ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        resolve(m);
        const tc = typeCheck(m);
        expect(tc.errors).toHaveLength(0);

        const cr = compile(m, { typeInfo: tc.typeInfo });
        expect(cr.ok).toBe(true);
    });

    it("Float-based freshness type compiles correctly", () => {
        const m = mod([
            fn("calc_temp", [
                param("a", freshType(FLOAT_TYPE, "30s")),
                param("b", freshType(FLOAT_TYPE, "1h")),
            ], [
                binop("-", ident("a"), ident("b")),
            ], FLOAT_TYPE, ["pure"]),
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

// =============================================================================
// Lint — stale_data_used warning
// =============================================================================

describe("freshness types — lint", () => {
    it("emits stale_data_used when pure function has fresh-typed param", () => {
        const m = mod([
            fn("compute", [
                param("price", freshType(INT_TYPE, "5m")),
            ], [
                ident("price"),
            ], INT_TYPE, ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const staleWarnings = warnings.filter(w => w.warning === "stale_data_used");
        expect(staleWarnings.length).toBe(1);
        const w = staleWarnings[0] as any;
        expect(w.functionName).toBe("compute");
        expect(w.paramName).toBe("price");
        expect(w.declaredMaxAge).toBe("5m");
    });

    it("no warning when function has io effect", () => {
        const m = mod([
            fn("fetch_and_compute", [
                param("price", freshType(INT_TYPE, "5m")),
            ], [
                ident("price"),
            ], INT_TYPE, ["io"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const staleWarnings = warnings.filter(w => w.warning === "stale_data_used");
        expect(staleWarnings.length).toBe(0);
    });

    it("no warning when param is not fresh-typed", () => {
        const m = mod([
            fn("compute", [
                param("price", INT_TYPE),
            ], [
                ident("price"),
            ], INT_TYPE, ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const staleWarnings = warnings.filter(w => w.warning === "stale_data_used");
        expect(staleWarnings.length).toBe(0);
    });

    it("warning per fresh-typed param in pure function", () => {
        const m = mod([
            fn("compute", [
                param("price", freshType(INT_TYPE, "5m")),
                param("rate", freshType(FLOAT_TYPE, "1h")),
            ], [
                ident("price"),
            ], INT_TYPE, ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const staleWarnings = warnings.filter(w => w.warning === "stale_data_used");
        expect(staleWarnings.length).toBe(2);
    });
});
