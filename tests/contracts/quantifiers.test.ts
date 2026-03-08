// =============================================================================
// Quantifier Contract Verifier Tests — forall / exists
// =============================================================================
// Tests that forall/exists in pre/post conditions correctly translate to
// Z3 ForAll/Exists quantifiers and produce provable, failing, or undecidable results.

import { describe, it, expect } from "vitest";
import { contractVerify } from "../../src/contracts/verify.js";
import type { EdictModule, FunctionDef, Expression, Contract, Param } from "../../src/ast/nodes.js";

// ---------------------------------------------------------------------------
// Helpers (same pattern as verify.test.ts)
// ---------------------------------------------------------------------------

let idCounter = 0;
function uid(): string { return `q-${++idCounter}`; }

function mkLit(value: number | boolean): Expression {
    const id = uid();
    if (typeof value === "boolean") {
        return { kind: "literal", id, value, type: { kind: "basic", name: "Bool" } } as any;
    }
    return { kind: "literal", id, value, type: { kind: "basic", name: "Int" } } as any;
}

function mkIdent(name: string): Expression {
    return { kind: "ident", id: uid(), name };
}

function mkBinop(op: string, left: Expression, right: Expression): Expression {
    return { kind: "binop", id: uid(), op, left, right } as any;
}

function mkAccess(target: Expression, field: string): Expression {
    return { kind: "access", id: uid(), target, field } as any;
}

function mkParam(name: string, typeName: string): Param {
    return { name, type: { kind: "basic", name: typeName } };
}

function mkPre(condition: Expression): Contract {
    return { kind: "pre", id: uid(), condition };
}

function mkPost(condition: Expression): Contract {
    return { kind: "post", id: uid(), condition };
}

/**
 * Create a forall expression: forall variable in [from, to): body
 */
function mkForall(variable: string, from: Expression, to: Expression, body: Expression): Expression {
    return {
        kind: "forall",
        id: uid(),
        variable,
        range: { from, to },
        body,
    } as any;
}

/**
 * Create an exists expression: exists variable in [from, to): body
 */
function mkExists(variable: string, from: Expression, to: Expression, body: Expression): Expression {
    return {
        kind: "exists",
        id: uid(),
        variable,
        range: { from, to },
        body,
    } as any;
}

function mkFn(opts: {
    name?: string;
    params?: Param[];
    contracts?: Contract[];
    body?: Expression[];
}): FunctionDef {
    return {
        kind: "fn",
        id: uid(),
        name: opts.name ?? "testFn",
        params: opts.params ?? [],
        effects: ["pure"],
        returnType: { kind: "basic", name: "Int" },
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
// Provable — forall
// ---------------------------------------------------------------------------

describe("quantifier contracts — forall provable", () => {
    it("1. forall i in [0, n): i >= 0 — trivially true for non-negative range", async () => {
        // Pre: n >= 0. Post: forall i in [0, n): i >= 0
        // This is trivially true since the range constraint gives i >= 0
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPre(mkBinop(">=", mkIdent("n"), mkLit(0))),
                mkPost(mkForall("i", mkLit(0), mkIdent("n"),
                    mkBinop(">=", mkIdent("i"), mkLit(0)))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(0);
    });

    it("2. forall i in [0, n): i < n — range bound implies i < to", async () => {
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPre(mkBinop(">", mkIdent("n"), mkLit(0))),
                mkPost(mkForall("i", mkLit(0), mkIdent("n"),
                    mkBinop("<", mkIdent("i"), mkIdent("n")))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(0);
    });

    it("3. precondition with forall — forall i in [0, n): x > i, with x >= n", async () => {
        // Pre: x >= n, n > 0, forall i in [0, n): x > i
        // This is provable because x >= n > i for all i in [0, n)
        const fn = mkFn({
            params: [mkParam("x", "Int"), mkParam("n", "Int")],
            contracts: [
                mkPre(mkBinop(">=", mkIdent("x"), mkIdent("n"))),
                mkPre(mkBinop(">", mkIdent("n"), mkLit(0))),
                mkPost(mkForall("i", mkLit(0), mkIdent("n"),
                    mkBinop(">", mkIdent("x"), mkIdent("i")))),
            ],
            body: [mkIdent("x")],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Provable — exists
// ---------------------------------------------------------------------------

describe("quantifier contracts — exists provable", () => {
    it("4. exists i in [0, 10): i == 5 — trivially satisfiable", async () => {
        const fn = mkFn({
            params: [],
            contracts: [
                mkPost(mkExists("i", mkLit(0), mkLit(10),
                    mkBinop("==", mkIdent("i"), mkLit(5)))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(0);
    });

    it("5. exists i in [0, n): i == 0, with n > 0 — 0 is in range", async () => {
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPre(mkBinop(">", mkIdent("n"), mkLit(0))),
                mkPost(mkExists("i", mkLit(0), mkIdent("n"),
                    mkBinop("==", mkIdent("i"), mkLit(0)))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Failing — counterexamples
// ---------------------------------------------------------------------------

describe("quantifier contracts — failing with counterexamples", () => {
    it("6. forall i in [0, n): i > 0 — fails at i=0", async () => {
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPre(mkBinop(">", mkIdent("n"), mkLit(0))),
                mkPost(mkForall("i", mkLit(0), mkIdent("n"),
                    mkBinop(">", mkIdent("i"), mkLit(0)))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(1);
        expect(errors[0]!.error).toBe("contract_failure");
    });

    it("7. forall i in [0, n): i < 3 — fails for n >= 4", async () => {
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPre(mkBinop(">", mkIdent("n"), mkLit(0))),
                mkPost(mkForall("i", mkLit(0), mkIdent("n"),
                    mkBinop("<", mkIdent("i"), mkLit(3)))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(1);
        expect(errors[0]!.error).toBe("contract_failure");
    });

    it("8. exists i in [0, 0): i == 0 — empty range, nothing satisfies", async () => {
        const fn = mkFn({
            params: [],
            contracts: [
                mkPost(mkExists("i", mkLit(0), mkLit(0),
                    mkBinop("==", mkIdent("i"), mkLit(0)))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(1);
        expect(errors[0]!.error).toBe("contract_failure");
    });

    it("9. forall i in [0, n): result > i — fails when result = n-1", async () => {
        // body returns n-1, so result = n-1.
        // forall i in [0, n): n-1 > i → fails when i = n-1 (n-1 > n-1 is false)
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPre(mkBinop(">", mkIdent("n"), mkLit(1))),
                mkPost(mkForall("i", mkLit(0), mkIdent("n"),
                    mkBinop(">", mkIdent("result"), mkIdent("i")))),
            ],
            body: [mkBinop("-", mkIdent("n"), mkLit(1))],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(1);
        expect(errors[0]!.error).toBe("contract_failure");
    });

    it("10. exists i in [5, 5): true — empty range, always false", async () => {
        const fn = mkFn({
            params: [],
            contracts: [
                mkPost(mkExists("i", mkLit(5), mkLit(5), mkLit(true))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(1);
        expect(errors[0]!.error).toBe("contract_failure");
    });
});

// ---------------------------------------------------------------------------
// Undecidable
// ---------------------------------------------------------------------------

describe("quantifier contracts — undecidable", () => {
    it("11. forall with string literal body → undecidable", async () => {
        // Body is a string literal — not translatable to Z3 Bool
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPost(mkForall("i", mkLit(0), mkIdent("n"),
                    { kind: "literal", id: uid(), value: "hello" } as any)),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors.some(e => e.error === "undecidable_predicate")).toBe(true);
    });

    it("12. forall with array expression in range → undecidable", async () => {
        // Range uses an array expression — not a Z3-translatable expression
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPost(mkForall("i",
                    { kind: "array", id: uid(), elements: [mkLit(1)] } as any,
                    mkIdent("n"),
                    mkBinop(">", mkIdent("i"), mkLit(0)))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors.some(e => e.error === "undecidable_predicate")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Interaction with field access (array.length pattern)
// ---------------------------------------------------------------------------

describe("quantifier contracts — field access patterns", () => {
    it("13. forall with arr.length — fresh access variables work", async () => {
        // forall i in [0, arr.length): i >= 0
        // arr.length is a fresh Z3 Int var, range gives i >= 0, so trivially true
        const fn = mkFn({
            params: [mkParam("n", "Int")],
            contracts: [
                mkPost(mkForall("i", mkLit(0), mkAccess(mkIdent("arr"), "length"),
                    mkBinop(">=", mkIdent("i"), mkLit(0)))),
            ],
            body: [mkLit(0)],
        });
        const { errors } = await contractVerify(mkModule([fn]));
        expect(errors).toHaveLength(0);
    });
});
