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
    return { kind: "provenance", base, sources: [source] };
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

// =============================================================================
// Host function auto-annotation — builtin provenance tagging (Issue #115)
// =============================================================================

import { BUILTIN_FUNCTIONS } from "../../src/builtins/builtins.js";
import { ALL_BUILTINS } from "../../src/builtins/registry.js";

const RESULT_STRING_TYPE: TypeExpr = {
    kind: "result",
    ok: { kind: "basic", name: "String" },
    err: { kind: "basic", name: "String" },
};
const STRING_TYPE: TypeExpr = { kind: "basic", name: "String" };
const INT64_TYPE: TypeExpr = { kind: "basic", name: "Int64" };

function call(fnName: string, args: Expression[], id = `call-${fnName}-001`): Expression {
    return { kind: "call", id, fn: ident(fnName, `fn-ref-${fnName}`), args };
}

function letExpr(name: string, value: Expression, type?: TypeExpr, id = `let-${name}-001`): Expression {
    return { kind: "let", id, name, value, ...(type ? { type } : {}) } as Expression;
}

describe("provenance types — host function auto-annotation", () => {
    describe("registry — provenance field on BuiltinDef", () => {
        it("httpGet has provenance 'io:http'", () => {
            const def = ALL_BUILTINS.find(b => b.name === "httpGet");
            expect(def?.provenance).toBe("io:http");
        });

        it("randomInt has provenance 'io:random'", () => {
            const def = ALL_BUILTINS.find(b => b.name === "randomInt");
            expect(def?.provenance).toBe("io:random");
        });

        it("now has provenance 'io:clock'", () => {
            const def = ALL_BUILTINS.find(b => b.name === "now");
            expect(def?.provenance).toBe("io:clock");
        });

        it("readFile has provenance 'io:file'", () => {
            const def = ALL_BUILTINS.find(b => b.name === "readFile");
            expect(def?.provenance).toBe("io:file");
        });

        it("env has provenance 'io:env'", () => {
            const def = ALL_BUILTINS.find(b => b.name === "env");
            expect(def?.provenance).toBe("io:env");
        });

        it("sha256 has no provenance (pure transform)", () => {
            const def = ALL_BUILTINS.find(b => b.name === "sha256");
            expect(def?.provenance).toBeUndefined();
        });

        it("writeFile has no provenance (returns status)", () => {
            const def = ALL_BUILTINS.find(b => b.name === "writeFile");
            expect(def?.provenance).toBeUndefined();
        });

        it("exit has no provenance (control flow)", () => {
            const def = ALL_BUILTINS.find(b => b.name === "exit");
            expect(def?.provenance).toBeUndefined();
        });
    });

    describe("type checker — auto provenance wrapping", () => {
        it("randomInt call infers Provenance<Int, 'io:random'> return type", () => {
            const m = mod([
                fn("main", [], [
                    call("randomInt", [literal(0, "lit-min-001"), literal(100, "lit-max-001")]),
                ], INT_TYPE, ["reads"]),
            ]);
            // randomInt returns Provenance<Int>, which erases to Int for comparison
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("randomInt inferred let type carries provenance", () => {
            const m = mod([
                fn("main", [], [
                    letExpr("x", call("randomInt", [literal(0, "lit-min-002"), literal(100, "lit-max-002")])),
                    ident("x"),
                ], INT_TYPE, ["reads"]),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            // The inferred type for the let binding should be provenance-wrapped
            const inferredType = tc.typeInfo.inferredLetTypes.get("let-x-001");
            expect(inferredType).toBeDefined();
            expect(inferredType!.kind).toBe("provenance");
            if (inferredType!.kind === "provenance") {
                expect(inferredType!.sources).toEqual(["io:random"]);
                expect(inferredType!.base).toEqual(INT_TYPE);
            }
        });

        it("auto-provenance is compatible with bare type annotation (erasure)", () => {
            // let x: Int = randomInt(0, 100) — should not error
            const m = mod([
                fn("main", [], [
                    letExpr("x", call("randomInt", [literal(0, "lit-min-003"), literal(100, "lit-max-003")]), INT_TYPE),
                    ident("x"),
                ], INT_TYPE, ["reads"]),
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });

        it("pure builtins do not get provenance wrapping", () => {
            const m = mod([
                fn("main", [
                    param("s", { kind: "basic", name: "String" }),
                ], [
                    letExpr("h", call("sha256", [ident("s")])),
                    ident("h"),
                ], { kind: "basic", name: "String" }, ["pure"]),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            // sha256 has no provenance — inferred type should be bare String
            const inferredType = tc.typeInfo.inferredLetTypes.get("let-h-001");
            expect(inferredType).toBeDefined();
            expect(inferredType!.kind).toBe("basic");
        });

        it("httpGet return type carries provenance through let inference", () => {
            const m = mod([
                fn("main", [], [
                    letExpr("resp", call("httpGet", [
                        { kind: "literal", id: "lit-url-001", value: "https://api.example.com" } as Expression,
                    ])),
                    ident("resp"),
                ], RESULT_STRING_TYPE, ["io"]),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const inferredType = tc.typeInfo.inferredLetTypes.get("let-resp-001");
            expect(inferredType).toBeDefined();
            expect(inferredType!.kind).toBe("provenance");
            if (inferredType!.kind === "provenance") {
                expect(inferredType!.sources).toEqual(["io:http"]);
                expect(inferredType!.base).toEqual(RESULT_STRING_TYPE);
            }
        });

        it("now return type carries provenance io:clock", () => {
            const m = mod([
                fn("main", [], [
                    letExpr("t", call("now", [])),
                    ident("t"),
                ], INT64_TYPE, ["reads"]),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const inferredType = tc.typeInfo.inferredLetTypes.get("let-t-001");
            expect(inferredType).toBeDefined();
            expect(inferredType!.kind).toBe("provenance");
            if (inferredType!.kind === "provenance") {
                expect(inferredType!.sources).toEqual(["io:clock"]);
                expect(inferredType!.base).toEqual(INT64_TYPE);
            }
        });

        it("env return type carries provenance io:env", () => {
            const m = mod([
                fn("main", [], [
                    letExpr("v", call("env", [
                        { kind: "literal", id: "lit-env-001", value: "HOME" } as Expression,
                    ])),
                    ident("v"),
                ], STRING_TYPE, ["reads"]),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const inferredType = tc.typeInfo.inferredLetTypes.get("let-v-001");
            expect(inferredType).toBeDefined();
            expect(inferredType!.kind).toBe("provenance");
            if (inferredType!.kind === "provenance") {
                expect(inferredType!.sources).toEqual(["io:env"]);
            }
        });

        it("writeFile return does NOT carry provenance", () => {
            const m = mod([
                fn("main", [], [
                    letExpr("r", call("writeFile", [
                        { kind: "literal", id: "lit-path-001", value: "/tmp/test" } as Expression,
                        { kind: "literal", id: "lit-content-001", value: "hello" } as Expression,
                    ])),
                    ident("r"),
                ], RESULT_STRING_TYPE, ["io"]),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const inferredType = tc.typeInfo.inferredLetTypes.get("let-r-001");
            expect(inferredType).toBeDefined();
            // writeFile has no provenance — should be bare result type
            expect(inferredType!.kind).not.toBe("provenance");
        });
    });
});

// =============================================================================
// Provenance chains — union-of-sources tracking (Issue #116)
// =============================================================================

describe("provenance chains — type checker", () => {
    describe("binary ops — sources propagation", () => {
        it("two provenance operands produce merged sources", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                    param("b", provenanceType(INT_TYPE, "api:binance")),
                ], [
                    letExpr("sum", binop("+", ident("a"), ident("b"))),
                    ident("sum"),
                ], INT_TYPE),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const sumType = tc.typeInfo.inferredLetTypes.get("let-sum-001");
            expect(sumType).toBeDefined();
            expect(sumType!.kind).toBe("provenance");
            if (sumType!.kind === "provenance") {
                expect(sumType!.sources).toEqual(["api:binance", "api:coinbase"]);
            }
        });

        it("one provenance + one bare preserves provenance sources as-is", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                    param("b", INT_TYPE),
                ], [
                    letExpr("sum", binop("+", ident("a"), ident("b"))),
                    ident("sum"),
                ], INT_TYPE),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const sumType = tc.typeInfo.inferredLetTypes.get("let-sum-001");
            expect(sumType).toBeDefined();
            expect(sumType!.kind).toBe("provenance");
            if (sumType!.kind === "provenance") {
                expect(sumType!.sources).toEqual(["api:coinbase"]);
            }
        });

        it("two bare operands produce no chain (no provenance)", () => {
            const m = mod([
                fn("main", [
                    param("a", INT_TYPE),
                    param("b", INT_TYPE),
                ], [
                    letExpr("sum", binop("+", ident("a"), ident("b"))),
                    ident("sum"),
                ], INT_TYPE),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const sumType = tc.typeInfo.inferredLetTypes.get("let-sum-001");
            expect(sumType).toBeDefined();
            expect(sumType!.kind).toBe("basic");
        });

        it("same source on both sides deduplicates", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                    param("b", provenanceType(INT_TYPE, "api:coinbase")),
                ], [
                    letExpr("sum", binop("+", ident("a"), ident("b"))),
                    ident("sum"),
                ], INT_TYPE),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const sumType = tc.typeInfo.inferredLetTypes.get("let-sum-001");
            expect(sumType).toBeDefined();
            expect(sumType!.kind).toBe("provenance");
            if (sumType!.kind === "provenance") {
                expect(sumType!.sources).toEqual(["api:coinbase"]);
            }
        });

        it("subtraction preserves chain", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:x")),
                    param("b", provenanceType(INT_TYPE, "api:y")),
                ], [
                    letExpr("diff", binop("-", ident("a"), ident("b"), "binop-diff-001")),
                    ident("diff", "id-diff-001"),
                ], INT_TYPE),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const diffType = tc.typeInfo.inferredLetTypes.get("let-diff-001");
            expect(diffType).toBeDefined();
            expect(diffType!.kind).toBe("provenance");
            if (diffType!.kind === "provenance") {
                expect(diffType!.sources).toEqual(["api:x", "api:y"]);
            }
        });

        it("chain-bearing result erases for return type compatibility", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                    param("b", provenanceType(INT_TYPE, "api:binance")),
                ], [
                    binop("+", ident("a"), ident("b")),
                ], INT_TYPE),  // declared return Int — should be compatible with derived Provenance
            ]);
            const result = checkModule(m);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("if-then-else — chain merging", () => {
        it("merges chains from both branches", () => {
            const m = mod([
                fn("main", [
                    param("cond", BOOL_TYPE),
                    param("a", provenanceType(INT_TYPE, "api:x")),
                    param("b", provenanceType(INT_TYPE, "api:y")),
                ], [
                    letExpr("result", {
                        kind: "if",
                        id: "if-001",
                        condition: ident("cond", "id-cond-001"),
                        then: [ident("a", "id-a-then-001")],
                        else: [ident("b", "id-b-else-001")],
                    } as Expression),
                    ident("result", "id-result-001"),
                ], INT_TYPE),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const resultType = tc.typeInfo.inferredLetTypes.get("let-result-001");
            expect(resultType).toBeDefined();
            expect(resultType!.kind).toBe("provenance");
            if (resultType!.kind === "provenance") {
                expect(resultType!.sources).toEqual(["api:x", "api:y"]);
            }
        });

        it("one provenance branch + one bare branch preserves provenance", () => {
            const m = mod([
                fn("main", [
                    param("cond", BOOL_TYPE),
                    param("a", provenanceType(INT_TYPE, "api:x")),
                    param("b", INT_TYPE),
                ], [
                    letExpr("result", {
                        kind: "if",
                        id: "if-002",
                        condition: ident("cond", "id-cond-002"),
                        then: [ident("a", "id-a-then-002")],
                        else: [ident("b", "id-b-else-002")],
                    } as Expression),
                    ident("result", "id-result-002"),
                ], INT_TYPE),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const resultType = tc.typeInfo.inferredLetTypes.get("let-result-001");
            expect(resultType).toBeDefined();
            expect(resultType!.kind).toBe("provenance");
            if (resultType!.kind === "provenance") {
                expect(resultType!.sources).toEqual(["api:x"]);
            }
        });
    });

    describe("let bindings — chain preservation", () => {
        it("chain is preserved through let binding", () => {
            const m = mod([
                fn("main", [
                    param("a", provenanceType(INT_TYPE, "api:coinbase")),
                    param("b", provenanceType(INT_TYPE, "api:binance")),
                ], [
                    letExpr("sum", binop("+", ident("a"), ident("b"))),
                    letExpr("doubled", binop("*",
                        ident("sum", "id-sum-002"),
                        literal(2, "lit-2-001"),
                    "binop-mul-001"), undefined, "let-doubled-001"),
                    ident("doubled", "id-doubled-001"),
                ], INT_TYPE),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            // sum should have chain from both sources
            const sumType = tc.typeInfo.inferredLetTypes.get("let-sum-001");
            expect(sumType).toBeDefined();
            expect(sumType!.kind).toBe("provenance");

            // doubled should also have provenance (from sum * literal — one-sided preserves)
            const doubledType = tc.typeInfo.inferredLetTypes.get("let-doubled-001");
            expect(doubledType).toBeDefined();
            expect(doubledType!.kind).toBe("provenance");
            if (doubledType!.kind === "provenance") {
                expect(doubledType!.sources).toContain("api:coinbase");
                expect(doubledType!.sources).toContain("api:binance");
            }
        });
    });

    describe("builtin auto-annotation — initial chain", () => {
        it("builtin provenance includes initial chain array", () => {
            const m = mod([
                fn("main", [], [
                    letExpr("x", call("randomInt", [literal(0, "lit-min-chain-001"), literal(100, "lit-max-chain-001")])),
                    ident("x"),
                ], INT_TYPE, ["reads"]),
            ]);
            const vr = validate(m);
            expect(vr.ok).toBe(true);
            resolve(m);
            const tc = typeCheck(m);
            expect(tc.errors).toHaveLength(0);

            const inferredType = tc.typeInfo.inferredLetTypes.get("let-x-001");
            expect(inferredType).toBeDefined();
            expect(inferredType!.kind).toBe("provenance");
            if (inferredType!.kind === "provenance") {
                expect(inferredType!.sources).toEqual(["io:random"]);
            }
        });
    });
});

// =============================================================================
// Provenance chains — lint warnings
// =============================================================================

describe("provenance — lint with sources", () => {
    it("literal_provenance still works with sources array", () => {
        const m = mod([
            fn("main", [
                param("a", provenanceType(INT_TYPE, "api:coinbase")),
            ], [
                literal(42),
            ], provenanceType(INT_TYPE, "api:coinbase")),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const litWarnings = warnings.filter(w => w.warning === "literal_provenance");
        expect(litWarnings.length).toBe(1);
    });

    it("no literal_provenance for derived sources", () => {
        const m = mod([
            fn("main", [
                param("a", provenanceType(INT_TYPE, "api:coinbase")),
            ], [
                ident("a"),
            ], {
                kind: "provenance",
                base: INT_TYPE,
                sources: ["derived"],
            } as ProvenanceType),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const litWarnings = warnings.filter(w => w.warning === "literal_provenance");
        expect(litWarnings.length).toBe(0);
    });

    it("no literal_provenance for multi-source provenance when body doesn't end in literal", () => {
        const m = mod([
            fn("main", [
                param("a", provenanceType(INT_TYPE, "api:coinbase")),
            ], [
                ident("a"),
            ], {
                kind: "provenance",
                base: INT_TYPE,
                sources: ["api:coinbase", "api:binance"],
            } as ProvenanceType),
        ]);

        const vr = validate(m);
        expect(vr.ok).toBe(true);
        const warnings = lint(m);

        const litWarnings = warnings.filter(w => w.warning === "literal_provenance");
        expect(litWarnings.length).toBe(0);
    });
});
