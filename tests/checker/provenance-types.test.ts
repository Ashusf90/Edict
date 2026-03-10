// =============================================================================
// Provenance Types — Tests (Issue #60)
// =============================================================================
// Covers: type checker erasure, codegen erasure, lint warnings, structured errors

import { describe, it, expect } from "vitest";
import { validate } from "../../src/validator/validate.js";
import { resolve } from "../../src/resolver/resolve.js";
import { typeCheck } from "../../src/checker/check.js";
import { compile } from "../../src/codegen/codegen.js";
import { lint } from "../../src/lint/lint.js";
import type { EdictModule, FunctionDef, Expression, Param } from "../../src/ast/nodes.js";
import type { TypeExpr, ProvenanceType } from "../../src/ast/types.js";

// =============================================================================
// Helpers
// =============================================================================

const INT_TYPE: TypeExpr = { kind: "basic", name: "Int" };
const FLOAT_TYPE: TypeExpr = { kind: "basic", name: "Float" };
const BOOL_TYPE: TypeExpr = { kind: "basic", name: "Bool" };

function provenanceType(base: TypeExpr, source: string): ProvenanceType {
    return { kind: "provenance", base, source };
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

function literal(value: number | string | boolean, id = "lit-001"): Expression {
    return { kind: "literal", id, value };
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
// Validator — provenance type structural validation
// =============================================================================

describe("provenance types — validator", () => {
    it("valid provenance type passes validation", () => {
        const m = mod([
            fn("main", [
                param("a", provenanceType(INT_TYPE, "api:coinbase")),
            ], [
                ident("a"),
            ], INT_TYPE),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });

    it("provenance wrapping Float passes", () => {
        const m = mod([
            fn("main", [
                param("a", provenanceType(FLOAT_TYPE, "api:weather")),
            ], [
                ident("a"),
            ], FLOAT_TYPE),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });

    it("provenance wrapping array type passes", () => {
        const arrType: TypeExpr = { kind: "array", element: INT_TYPE };
        const m = mod([
            fn("main", [
                param("a", provenanceType(arrType, "api:data")),
            ], [
                ident("a"),
            ], arrType),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });
});

// =============================================================================
// Type Checker — erasure and compatibility
// =============================================================================

describe("provenance types — checker", () => {
    describe("erasure — Provenance<T> compatible with T", () => {
        it("Provenance<Int, 'api:x'> assignable to Int return type", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                ], [
                    ident("a"), // returns Provenance<Int, "api:coinbase">
                ], INT_TYPE),  // declared return Int
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("Int assignable to Provenance<Int, 'api:x'> return type", () => {
            const m = mod([
                fn("main", [
                    param("a", INT_TYPE),
                ], [
                    ident("a"), // returns Int
                ], provenanceType(INT_TYPE, "api:coinbase")), // declared return Provenance<Int>
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("Provenance<Int, 'api:x'> compatible with Provenance<Int, 'api:y'> (different sources, same base)", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                ], [
                    ident("a"),
                ], provenanceType(INT_TYPE, "api:binance")), // different source, same base
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("incompatibility — different base types", () => {
        it("Provenance<Int, 'api:x'> not compatible with Float", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                ], [
                    ident("a"),
                ], FLOAT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toHaveProperty("error", "type_mismatch");
        });

        it("Provenance<Int, 'api:x'> not compatible with Provenance<Float, 'api:x'>", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                ], [
                    ident("a"),
                ], provenanceType(FLOAT_TYPE, "api:coinbase")),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe("arithmetic with provenance types", () => {
        it("same-base provenance values can add", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                    param("b", provenanceType(INT_TYPE, "api:binance")),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], INT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("provenance value and bare value can add (erasure)", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                    param("b", INT_TYPE),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], INT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("provenance values can use comparison operators", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                    param("b", provenanceType(INT_TYPE, "api:binance")),
                ], [
                    binop(">", ident("a"), ident("b")),
                ], BOOL_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("nested provenance types", () => {
        it("nested Provenance<Provenance<Int>> erases to Int", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(provenanceType(INT_TYPE, "api:inner"), "api:outer")),
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
// Codegen — provenance type erasure
// =============================================================================

describe("provenance types — codegen erasure", () => {
    it("Int-based provenance type compiles correctly", () => {
        const m = mod([
            fn("add_values", [
                param("a", provenanceType(INT_TYPE, "api:coinbase")),
                param("b", provenanceType(INT_TYPE, "api:binance")),
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

    it("Float-based provenance type compiles correctly", () => {
        const m = mod([
            fn("calc", [
                param("a", provenanceType(FLOAT_TYPE, "api:weather")),
                param("b", provenanceType(FLOAT_TYPE, "sensor:temp")),
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
// Lint — literal_provenance warning
// =============================================================================

describe("provenance types — lint", () => {
    it("emits literal_provenance when function claims non-literal source but returns literal", () => {
        const m = mod([
            fn("get_price", [
                param("x", INT_TYPE),
            ], [
                literal(42, "lit-suspicious-001"), // hardcoded literal — suspicious!
            ], provenanceType(INT_TYPE, "api:coinbase"), ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lpWarnings = warnings.filter(w => w.warning === "literal_provenance");
        expect(lpWarnings.length).toBe(1);
        const w = lpWarnings[0] as any;
        expect(w.functionName).toBe("get_price");
        expect(w.declaredSource).toBe("api:coinbase");
    });

    it("no warning when source is 'literal'", () => {
        const m = mod([
            fn("get_default", [
                param("x", INT_TYPE),
            ], [
                literal(0, "lit-default-001"),
            ], provenanceType(INT_TYPE, "literal"), ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lpWarnings = warnings.filter(w => w.warning === "literal_provenance");
        expect(lpWarnings.length).toBe(0);
    });

    it("no warning when source is 'derived'", () => {
        const m = mod([
            fn("compute", [
                param("x", INT_TYPE),
            ], [
                literal(100, "lit-derived-001"),
            ], provenanceType(INT_TYPE, "derived"), ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lpWarnings = warnings.filter(w => w.warning === "literal_provenance");
        expect(lpWarnings.length).toBe(0);
    });

    it("no warning for function without provenance return type", () => {
        const m = mod([
            fn("compute", [
                param("x", INT_TYPE),
            ], [
                literal(42, "lit-normal-001"),
            ], INT_TYPE, ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lpWarnings = warnings.filter(w => w.warning === "literal_provenance");
        expect(lpWarnings.length).toBe(0);
    });

    it("no warning when body does not end in literal", () => {
        const m = mod([
            fn("fetch_price", [
                param("x", provenanceType(INT_TYPE, "api:coinbase")),
            ], [
                ident("x"), // returns the parameter, not a literal
            ], provenanceType(INT_TYPE, "api:coinbase"), ["pure"]),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lpWarnings = warnings.filter(w => w.warning === "literal_provenance");
        expect(lpWarnings.length).toBe(0);
    });
});
