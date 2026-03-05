import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validate } from "../../src/validator/validate.js";
import { resolve } from "../../src/resolver/resolve.js";
import { typeCheck } from "../../src/checker/check.js";
import { effectCheck } from "../../src/effects/effect-check.js";
import type { EdictModule } from "../../src/ast/nodes.js";

// =============================================================================
// Fuzz tests for semantic stages — structurally valid but semantically wrong
// =============================================================================
// Strategy: take a valid AST, apply random mutations to names/types/effects,
// then run through resolve → typeCheck → effectCheck (skipping Z3).
// Property: never throws, always returns StructuredError[].

/** Base valid AST (contract-free to avoid Z3). */
function makeBase(overrides: Partial<{
    fnName: string;
    paramName: string;
    paramType: string;
    returnType: string;
    effects: string[];
    bodyValue: number | string | boolean;
    op: string;
}> = {}): unknown {
    const {
        fnName = "main",
        paramName = "x",
        paramType = "Int",
        returnType = "Int",
        effects = ["pure"],
        bodyValue = 42,
    } = overrides;

    return {
        kind: "module",
        id: "fuzz-mod-001",
        name: "test",
        imports: [],
        definitions: [
            {
                kind: "fn",
                id: "fuzz-fn-001",
                name: fnName,
                params: [
                    {
                        kind: "param",
                        id: "fuzz-param-001",
                        name: paramName,
                        type: { kind: "basic", name: paramType },
                    },
                ],
                effects,
                returnType: { kind: "basic", name: returnType },
                contracts: [],
                body: [{ kind: "literal", id: "fuzz-lit-001", value: bodyValue }],
            },
        ],
    };
}

/** Run through the semantic pipeline stages (no Z3). */
function runSemanticPipeline(ast: unknown): {
    validateOk: boolean;
    resolveErrors: number;
    typeErrors: number;
    effectErrors: number;
} {
    const vResult = validate(ast);
    if (!vResult.ok) {
        return { validateOk: false, resolveErrors: 0, typeErrors: 0, effectErrors: 0 };
    }

    const module = ast as EdictModule;
    const rErrors = resolve(module);
    if (rErrors.length > 0) {
        return { validateOk: true, resolveErrors: rErrors.length, typeErrors: 0, effectErrors: 0 };
    }

    const tErrors = typeCheck(module);
    if (tErrors.length > 0) {
        return { validateOk: true, resolveErrors: 0, typeErrors: tErrors.length, effectErrors: 0 };
    }

    const eErrors = effectCheck(module);
    return { validateOk: true, resolveErrors: 0, typeErrors: 0, effectErrors: eErrors.length };
}

describe("fuzz — semantic pipeline", () => {
    // =========================================================================
    // Property 1: Random identifier names in function body
    // =========================================================================
    it("never throws on random identifier names in body", () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 30 }), (randomName) => {
                const ast = {
                    kind: "module",
                    id: "fuzz-mod-001",
                    name: "test",
                    imports: [],
                    definitions: [
                        {
                            kind: "fn",
                            id: "fuzz-fn-001",
                            name: "main",
                            params: [],
                            effects: ["pure"],
                            returnType: { kind: "basic", name: "Int" },
                            contracts: [],
                            body: [
                                { kind: "ident", id: "fuzz-ident-001", name: randomName },
                            ],
                        },
                    ],
                };

                // Should validate, then either resolve successfully or produce errors
                const result = runSemanticPipeline(ast);
                expect(result.validateOk).toBe(true);
                // Either error or success — never crash
            }),
            { numRuns: 500 },
        );
    });

    // =========================================================================
    // Property 2: Random type names in parameters and return type
    // =========================================================================
    it("never throws on random basic type names", () => {
        const typeNames = ["Int", "Float", "String", "Bool", "Void", "Number", "Any", "Unknown", ""];

        fc.assert(
            fc.property(
                fc.constantFrom(...typeNames),
                fc.constantFrom(...typeNames),
                (paramType, retType) => {
                    const ast = makeBase({ paramType, returnType: retType });
                    const result = runSemanticPipeline(ast);
                    // Validation may fail for invalid types, that's expected
                    expect(result).toBeDefined();
                },
            ),
            { numRuns: 500 },
        );
    });

    // =========================================================================
    // Property 3: Random effect mutations
    // =========================================================================
    it("never throws on random effect combinations", () => {
        const allEffects = ["pure", "reads", "writes", "io", "fails"];

        fc.assert(
            fc.property(
                fc.subarray(allEffects, { minLength: 1, maxLength: 5 }),
                (effects) => {
                    // Create two functions: a pure one calling an effectful one
                    const ast = {
                        kind: "module",
                        id: "fuzz-mod-001",
                        name: "test",
                        imports: [],
                        definitions: [
                            {
                                kind: "fn",
                                id: "fuzz-fn-001",
                                name: "helper",
                                params: [],
                                effects,
                                returnType: { kind: "basic", name: "Int" },
                                contracts: [],
                                body: [{ kind: "literal", id: "fuzz-lit-001", value: 1 }],
                            },
                            {
                                kind: "fn",
                                id: "fuzz-fn-002",
                                name: "main",
                                params: [],
                                effects: ["pure"],
                                returnType: { kind: "basic", name: "Int" },
                                contracts: [],
                                body: [
                                    {
                                        kind: "call",
                                        id: "fuzz-call-001",
                                        fn: { kind: "ident", id: "fuzz-ident-001", name: "helper" },
                                        args: [],
                                    },
                                ],
                            },
                        ],
                    };

                    // Some combinations (e.g., ["pure", "io"]) are correctly
                    // rejected by the validator as conflicting. The property is:
                    // no crashes, regardless of validation outcome.
                    const result = runSemanticPipeline(ast);
                    expect(result).toBeDefined();
                },
            ),
            { numRuns: 500 },
        );
    });

    // =========================================================================
    // Property 4: Random binary operator values
    // =========================================================================
    it("never throws on random operator strings", () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 10 }), (op) => {
                const ast = {
                    kind: "module",
                    id: "fuzz-mod-001",
                    name: "test",
                    imports: [],
                    definitions: [
                        {
                            kind: "fn",
                            id: "fuzz-fn-001",
                            name: "main",
                            params: [],
                            effects: ["pure"],
                            returnType: { kind: "basic", name: "Int" },
                            contracts: [],
                            body: [
                                {
                                    kind: "binop",
                                    id: "fuzz-binop-001",
                                    op,
                                    left: { kind: "literal", id: "fuzz-lit-001", value: 1 },
                                    right: { kind: "literal", id: "fuzz-lit-002", value: 2 },
                                },
                            ],
                        },
                    ],
                };

                // Invalid operators should fail validation, never crash
                const result = validate(ast);
                expect(result).toBeDefined();
                expect(typeof result.ok).toBe("boolean");
            }),
            { numRuns: 500 },
        );
    });
});
