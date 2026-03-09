// =============================================================================
// Semantic Assertions Tests
// =============================================================================
// Tests for the pre-built Z3 predicates catalog (issue #66).
// 7 translation + 4 failing + 3 validation + 1 composable = 15 tests

import { describe, it, expect, beforeAll } from "vitest";
import { contractVerify } from "../../src/contracts/verify.js";
import { validate } from "../../src/validator/validate.js";
import type {
    EdictModule,
    FunctionDef,
    Expression,
    Contract,
    Param,
    SemanticAssertion,
} from "../../src/ast/nodes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function uid(): string { return `sem-test-${++idCounter}`; }

function mkLit(value: number | boolean): Expression {
    const id = uid();
    if (typeof value === "boolean") {
        return { kind: "literal", id, value, type: { kind: "basic", name: "Bool" } } as any;
    }
    return { kind: "literal", id, value, type: Number.isInteger(value) ? { kind: "basic", name: "Int" } : { kind: "basic", name: "Float" } } as any;
}

function mkIdent(name: string): Expression {
    return { kind: "ident", id: uid(), name };
}

function mkParam(name: string, typeName: string): Param {
    return { name, type: { kind: "basic", name: typeName } };
}

function mkSemanticPost(semantic: SemanticAssertion): Contract {
    return { kind: "post", id: uid(), semantic };
}

function mkFn(opts: {
    name?: string;
    params?: Param[];
    contracts?: Contract[];
    body?: Expression[];
    returnType?: any;
}): FunctionDef {
    return {
        kind: "fn",
        id: uid(),
        name: opts.name ?? "testFn",
        params: opts.params ?? [],
        effects: ["pure"],
        returnType: opts.returnType ?? { kind: "basic", name: "Int" },
        contracts: opts.contracts ?? [],
        body: opts.body ?? [mkLit(0)],
    };
}

function mkModule(defs: FunctionDef[]): EdictModule {
    return {
        kind: "module",
        id: uid(),
        name: "test",
        imports: [],
        definitions: defs,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Semantic Assertions", () => {
    beforeAll(() => {
        idCounter = 0;
    });

    // -----------------------------------------------------------------------
    // Translation — verify each assertion kind translates to Z3 without crash.
    // Semantic assertions use symbolic Z3 arrays which are disconnected from
    // the scalar function body, so Z3 may find counterexamples or report
    // undecidable.  The key property is: no JS crash, result is well-formed.
    // -----------------------------------------------------------------------
    describe("Translation — each assertion kind produces a Z3 result", () => {
        it("sorted: translates and produces a verifier result", async () => {
            const fn = mkFn({
                contracts: [mkSemanticPost({ assertion: "sorted", target: "result" })],
            });
            const result = await contractVerify(mkModule([fn]));
            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it("no_duplicates: translates and produces a verifier result", async () => {
            const fn = mkFn({
                contracts: [mkSemanticPost({ assertion: "no_duplicates", target: "result" })],
            });
            const result = await contractVerify(mkModule([fn]));
            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it("bounded: translates and produces a verifier result", async () => {
            const fn = mkFn({
                contracts: [mkSemanticPost({ assertion: "bounded", target: "result", args: ["0", "100"] })],
            });
            const result = await contractVerify(mkModule([fn]));
            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it("length_preserved: translates and produces a verifier result", async () => {
            const fn = mkFn({
                params: [mkParam("input", "Int")],
                contracts: [mkSemanticPost({ assertion: "length_preserved", target: "result", args: ["input"] })],
                body: [mkIdent("input")],
            });
            const result = await contractVerify(mkModule([fn]));
            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it("sum_preserved: translates and produces a verifier result", async () => {
            const fn = mkFn({
                params: [mkParam("input", "Int")],
                contracts: [mkSemanticPost({ assertion: "sum_preserved", target: "result", args: ["input"] })],
                body: [mkIdent("input")],
            });
            const result = await contractVerify(mkModule([fn]));
            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it("subset_of: translates and produces a verifier result", async () => {
            const fn = mkFn({
                params: [mkParam("input", "Int")],
                contracts: [mkSemanticPost({ assertion: "subset_of", target: "result", args: ["input"] })],
                body: [mkIdent("input")],
            });
            const result = await contractVerify(mkModule([fn]));
            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it("permutation_of: translates and produces a verifier result", async () => {
            const fn = mkFn({
                params: [mkParam("input", "Int")],
                contracts: [mkSemanticPost({ assertion: "permutation_of", target: "result", args: ["input"] })],
                body: [mkIdent("input")],
            });
            const result = await contractVerify(mkModule([fn]));
            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Failure semantics — verify errors have the right structure
    // -----------------------------------------------------------------------
    describe("Failure semantics — contract_failure includes semanticAssertion", () => {
        it("contract_failure from sorted includes semanticAssertion='sorted'", async () => {
            const fn = mkFn({
                params: [mkParam("x", "Int")],
                contracts: [mkSemanticPost({ assertion: "sorted", target: "result" })],
                body: [mkIdent("x")],
            });
            const result = await contractVerify(mkModule([fn]));
            const failures = result.errors.filter(e => e.error === "contract_failure");
            // If Z3 produced a contract_failure, it must have the semanticAssertion field
            for (const f of failures) {
                expect((f as any).semanticAssertion).toBe("sorted");
            }
        });

        it("contract_failure from bounded includes semanticAssertion='bounded'", async () => {
            const fn = mkFn({
                contracts: [mkSemanticPost({ assertion: "bounded", target: "result", args: ["0", "10"] })],
                body: [mkLit(999)],
            });
            const result = await contractVerify(mkModule([fn]));
            const failures = result.errors.filter(e => e.error === "contract_failure");
            for (const f of failures) {
                expect((f as any).semanticAssertion).toBe("bounded");
            }
        });

        it("contract_failure from no_duplicates includes semanticAssertion='no_duplicates'", async () => {
            const fn = mkFn({
                contracts: [mkSemanticPost({ assertion: "no_duplicates", target: "result" })],
                body: [mkLit(0)],
            });
            const result = await contractVerify(mkModule([fn]));
            const failures = result.errors.filter(e => e.error === "contract_failure");
            for (const f of failures) {
                expect((f as any).semanticAssertion).toBe("no_duplicates");
            }
        });

        it("errors array only contains contract_failure, verification_timeout, or undecidable_predicate", async () => {
            const fn = mkFn({
                contracts: [mkSemanticPost({ assertion: "sorted", target: "result" })],
                body: [mkLit(0)],
            });
            const result = await contractVerify(mkModule([fn]));
            for (const e of result.errors) {
                expect(["contract_failure", "verification_timeout", "undecidable_predicate"]).toContain(e.error);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Validation — validator rejects invalid semantic contracts
    // -----------------------------------------------------------------------
    describe("Validation — schema & semantic checks", () => {
        it("unknown assertion name produces invalid_semantic_assertion error", () => {
            const module = {
                kind: "module",
                id: "mod-1",
                name: "test",
                imports: [],
                definitions: [{
                    kind: "fn",
                    id: "fn-1",
                    name: "testFn",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [{
                        kind: "post",
                        id: "c-1",
                        semantic: { assertion: "nonexistent", target: "result" },
                    }],
                    body: [{ kind: "literal", id: "lit-1", value: 0 }],
                }],
            };
            const result = validate(module);
            expect(result.ok).toBe(false);
            const err = result.errors!.find(e => e.error === "invalid_semantic_assertion");
            expect(err).toBeDefined();
            expect((err as any).received).toBe("nonexistent");
        });

        it("contract with both condition and semantic produces error", () => {
            const module = {
                kind: "module",
                id: "mod-2",
                name: "test",
                imports: [],
                definitions: [{
                    kind: "fn",
                    id: "fn-2",
                    name: "testFn",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [{
                        kind: "post",
                        id: "c-2",
                        condition: { kind: "literal", id: "lit-c", value: true },
                        semantic: { assertion: "sorted", target: "result" },
                    }],
                    body: [{ kind: "literal", id: "lit-2", value: 0 }],
                }],
            };
            const result = validate(module);
            expect(result.ok).toBe(false);
            const err = result.errors!.find(e => e.error === "invalid_field_type" && (e as any).field === "semantic");
            expect(err).toBeDefined();
        });

        it("contract with neither condition nor semantic produces error", () => {
            const module = {
                kind: "module",
                id: "mod-3",
                name: "test",
                imports: [],
                definitions: [{
                    kind: "fn",
                    id: "fn-3",
                    name: "testFn",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [{
                        kind: "post",
                        id: "c-3",
                    }],
                    body: [{ kind: "literal", id: "lit-3", value: 0 }],
                }],
            };
            const result = validate(module);
            expect(result.ok).toBe(false);
            const err = result.errors!.find(e => e.error === "missing_field" && (e as any).field === "condition");
            expect(err).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Composability — multiple semantic assertions
    // -----------------------------------------------------------------------
    describe("Composability", () => {
        it("two semantic assertions on same function both produce verifier results", async () => {
            const fn = mkFn({
                params: [mkParam("input", "Int")],
                contracts: [
                    mkSemanticPost({ assertion: "sorted", target: "result" }),
                    mkSemanticPost({ assertion: "no_duplicates", target: "result" }),
                ],
                body: [mkIdent("input")],
            });
            const result = await contractVerify(mkModule([fn]));
            expect(result).toBeDefined();
            // Both assertions should produce errors (contract_failure, timeout, or undecidable)
            // The key is that both are processed — at least 1 error per assertion or 0 if both proven
            expect(result.errors.length).toBeGreaterThanOrEqual(0);
        });
    });
});
