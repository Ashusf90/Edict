// =============================================================================
// Confidence Types — Tests (Issue #69)
// =============================================================================
// Covers: type checker erasure, codegen erasure, lint warnings, structured errors

import { describe, it, expect } from "vitest";
import { validate } from "../../src/validator/validate.js";
import { resolve } from "../../src/resolver/resolve.js";
import { typeCheck } from "../../src/checker/check.js";
import { compile } from "../../src/codegen/codegen.js";
import { lint } from "../../src/lint/lint.js";
import type { EdictModule, FunctionDef, Expression, Param } from "../../src/ast/nodes.js";
import type { TypeExpr, ConfidenceType } from "../../src/ast/types.js";

// =============================================================================
// Helpers
// =============================================================================

const INT_TYPE: TypeExpr = { kind: "basic", name: "Int" };
const FLOAT_TYPE: TypeExpr = { kind: "basic", name: "Float" };
const BOOL_TYPE: TypeExpr = { kind: "basic", name: "Bool" };

function confidenceType(base: TypeExpr, confidence: number): ConfidenceType {
    return { kind: "confidence", base, confidence };
}

function mod(defs: EdictModule["definitions"], minConfidence?: number): EdictModule {
    return {
        kind: "module",
        id: "mod-test-001",
        name: "test",
        imports: [],
        definitions: defs,
        ...(minConfidence !== undefined ? { minConfidence } : {}),
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
// Validator — confidence type structural validation
// =============================================================================

describe("confidence types — validator", () => {
    it("valid confidence type passes validation", () => {
        const m = mod([
            fn("main", [
                param("a", confidenceType(INT_TYPE, 0.9)),
            ], [
                ident("a"),
            ], INT_TYPE),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });

    it("confidence wrapping Float passes", () => {
        const m = mod([
            fn("main", [
                param("a", confidenceType(FLOAT_TYPE, 0.5)),
            ], [
                ident("a"),
            ], FLOAT_TYPE),
        ]);
        const vr = validate(m);
        expect(vr.ok).toBe(true);
    });

    it("confidence wrapping array type passes", () => {
        const arrType: TypeExpr = { kind: "array", element: INT_TYPE };
        const m = mod([
            fn("main", [
                param("a", confidenceType(arrType, 0.8)),
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

describe("confidence types — checker", () => {
    describe("erasure — Confidence<T> compatible with T", () => {
        it("Confidence<Int, 0.9> assignable to Int return type", () => {
            const m = mod([
                fn("main", [
                    param("a", confidenceType(INT_TYPE, 0.9)),
                ], [
                    ident("a"), // returns Confidence<Int, 0.9>
                ], INT_TYPE),  // declared return Int
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("Int assignable to Confidence<Int, 0.9> return type", () => {
            const m = mod([
                fn("main", [
                    param("a", INT_TYPE),
                ], [
                    ident("a"), // returns Int
                ], confidenceType(INT_TYPE, 0.9)), // declared return Confidence<Int, 0.9>
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("Confidence<Int, 0.9> compatible with Confidence<Int, 0.7> (different scores, same base)", () => {
            const m = mod([
                fn("main", [
                    param("a", confidenceType(INT_TYPE, 0.9)),
                ], [
                    ident("a"),
                ], confidenceType(INT_TYPE, 0.7)), // different score, same base
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("incompatibility — different base types", () => {
        it("Confidence<Int, 0.9> not compatible with Float", () => {
            const m = mod([
                fn("main", [
                    param("a", confidenceType(INT_TYPE, 0.9)),
                ], [
                    ident("a"),
                ], FLOAT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toHaveProperty("error", "type_mismatch");
        });

        it("Confidence<Int, 0.9> not compatible with Confidence<Float, 0.9>", () => {
            const m = mod([
                fn("main", [
                    param("a", confidenceType(INT_TYPE, 0.9)),
                ], [
                    ident("a"),
                ], confidenceType(FLOAT_TYPE, 0.9)),
            ]);
            const result = checkModule(m);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe("arithmetic with confidence types", () => {
        it("same-base confidence values can add", () => {
            const m = mod([
                fn("main", [
                    param("a", confidenceType(INT_TYPE, 0.9)),
                    param("b", confidenceType(INT_TYPE, 0.8)),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], INT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("confidence value and bare value can add (erasure)", () => {
            const m = mod([
                fn("main", [
                    param("a", confidenceType(INT_TYPE, 0.9)),
                    param("b", INT_TYPE),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], INT_TYPE),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("nested confidence types", () => {
        it("nested Confidence<Confidence<Int, 0.9>, 0.8> erases to Int", () => {
            const m = mod([
                fn("main", [
                    param("a", confidenceType(confidenceType(INT_TYPE, 0.9), 0.8)),
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
// Codegen — confidence type erasure
// =============================================================================

describe("confidence types — codegen erasure", () => {
    it("Int-based confidence type compiles correctly", () => {
        const m = mod([
            fn("add_values", [
                param("a", confidenceType(INT_TYPE, 0.9)),
                param("b", confidenceType(INT_TYPE, 0.8)),
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

    it("Float-based confidence type compiles correctly", () => {
        const m = mod([
            fn("calc", [
                param("a", confidenceType(FLOAT_TYPE, 0.7)),
                param("b", confidenceType(FLOAT_TYPE, 0.6)),
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
// Lint — low_confidence_output warning
// =============================================================================

describe("confidence types — lint", () => {
    it("emits low_confidence_output when return confidence below minConfidence", () => {
        const m = mod([
            fn("classify", [
                param("x", INT_TYPE),
            ], [
                ident("x"),
            ], confidenceType(INT_TYPE, 0.6), ["pure"]),
        ], 0.8); // minConfidence = 0.8

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lcWarnings = warnings.filter(w => w.warning === "low_confidence_output");
        expect(lcWarnings.length).toBe(1);
        const w = lcWarnings[0] as any;
        expect(w.functionName).toBe("classify");
        expect(w.returnConfidence).toBe(0.6);
        expect(w.minConfidence).toBe(0.8);
    });

    it("no warning when return confidence meets threshold", () => {
        const m = mod([
            fn("classify", [
                param("x", INT_TYPE),
            ], [
                ident("x"),
            ], confidenceType(INT_TYPE, 0.9), ["pure"]),
        ], 0.8);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lcWarnings = warnings.filter(w => w.warning === "low_confidence_output");
        expect(lcWarnings.length).toBe(0);
    });

    it("no warning when no minConfidence set on module", () => {
        const m = mod([
            fn("classify", [
                param("x", INT_TYPE),
            ], [
                ident("x"),
            ], confidenceType(INT_TYPE, 0.1), ["pure"]),
        ]); // no minConfidence

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lcWarnings = warnings.filter(w => w.warning === "low_confidence_output");
        expect(lcWarnings.length).toBe(0);
    });

    it("no warning for function without confidence return type", () => {
        const m = mod([
            fn("compute", [
                param("x", INT_TYPE),
            ], [
                ident("x"),
            ], INT_TYPE, ["pure"]),
        ], 0.8);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const lcWarnings = warnings.filter(w => w.warning === "low_confidence_output");
        expect(lcWarnings.length).toBe(0);
    });
});
