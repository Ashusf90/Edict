// =============================================================================
// Contract Verification Worker Thread Tests
// =============================================================================
// 5 tests verifying that Z3 contract verification can run in a worker
// thread, producing the same results as direct (in-process) verification.

import { describe, it, expect, beforeEach } from "vitest";
import { contractVerify, clearVerificationCache } from "../../src/contracts/verify.js";
import type { EdictModule, FunctionDef, Expression, Contract, Param } from "../../src/ast/nodes.js";

// ---------------------------------------------------------------------------
// Helpers (same conventions as cache.test.ts)
// ---------------------------------------------------------------------------

let idCounter = 0;
function uid(): string { return `worker-test-${++idCounter}`; }

function mkLit(value: number | boolean): Expression {
    const id = uid();
    if (typeof value === "number") {
        return { kind: "literal", id, value, type: { kind: "basic", name: "Int" } } as any;
    }
    return { kind: "literal", id, value, type: { kind: "basic", name: "Bool" } } as any;
}

function mkIdent(name: string): Expression {
    return { kind: "ident", id: uid(), name };
}

function mkBinop(op: string, left: Expression, right: Expression): Expression {
    return { kind: "binop", id: uid(), op, left, right } as any;
}

function mkParam(name: string, typeName: string): Param {
    return { kind: "param", id: uid(), name, type: { kind: "basic", name: typeName } } as any;
}

function mkPre(condition: Expression): Contract {
    return { kind: "pre", id: uid(), condition };
}

function mkPost(condition: Expression): Contract {
    return { kind: "post", id: uid(), condition };
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
// Tests
// ---------------------------------------------------------------------------

describe("contract verification worker thread", () => {
    beforeEach(() => {
        clearVerificationCache();
        idCounter = 0;
    });

    it("1. worker produces same results as direct verification", async () => {
        const mkFnFixed = () => mkFn({
            name: "f",
            params: [mkParam("x", "Int")],
            contracts: [
                mkPre(mkBinop(">", mkIdent("x"), mkLit(0))),
                mkPost(mkBinop(">", mkIdent("result"), mkLit(0))),
            ],
            body: [mkBinop("+", mkIdent("x"), mkLit(1))],
        });

        // Run with worker
        const workerResult = await contractVerify(mkModule([mkFnFixed()]), { useWorker: true });

        clearVerificationCache();
        idCounter = 0;

        // Run without worker
        const directResult = await contractVerify(mkModule([mkFnFixed()]), { useWorker: false });

        // Results should be identical
        expect(workerResult.errors).toHaveLength(directResult.errors.length);
        expect(workerResult.errors.length).toBe(0);
    }, 15_000);

    it("2. cache + worker integration — first miss, second hit", async () => {
        const mkFnFixed = () => mkFn({
            name: "f",
            params: [mkParam("x", "Int")],
            contracts: [
                mkPre(mkBinop(">", mkIdent("x"), mkLit(0))),
                mkPost(mkBinop(">", mkIdent("result"), mkLit(0))),
            ],
            body: [mkBinop("+", mkIdent("x"), mkLit(1))],
        });

        // First call — cache miss → uses worker
        const r1 = await contractVerify(mkModule([mkFnFixed()]), { useWorker: true });
        expect(r1.errors).toHaveLength(0);
        expect(r1.cacheStats?.hits).toBe(0);
        expect(r1.cacheStats?.misses).toBeGreaterThan(0);

        // Second call — cache hit → no worker needed
        const start = performance.now();
        const r2 = await contractVerify(mkModule([mkFnFixed()]), { useWorker: true });
        const elapsed = performance.now() - start;

        expect(r2.errors).toHaveLength(0);
        expect(r2.cacheStats?.hits).toBeGreaterThan(0);
        // Cache hit should be fast — no worker spawn overhead
        expect(elapsed).toBeLessThan(100);
    }, 15_000);

    it("3. contract failure via worker returns counterexample", async () => {
        // abs(x) postcondition fails when x < 0 and body just returns x
        const fn = mkFn({
            name: "abs",
            params: [mkParam("x", "Int")],
            contracts: [
                mkPost(mkBinop(">=", mkIdent("result"), mkLit(0))),
            ],
            body: [mkIdent("x")], // Bug: doesn't handle negative
        });

        const result = await contractVerify(mkModule([fn]), { useWorker: true });
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]!.error).toBe("contract_failure");
    }, 15_000);

    it("4. no worker for empty contracts", async () => {
        const fn = mkFn({
            name: "simple",
            params: [mkParam("x", "Int")],
            contracts: [], // No contracts
            body: [mkIdent("x")],
        });

        const start = performance.now();
        const result = await contractVerify(mkModule([fn]), { useWorker: true });
        const elapsed = performance.now() - start;

        expect(result.errors).toHaveLength(0);
        // Should be essentially instant — no Z3, no worker
        expect(elapsed).toBeLessThan(50);
    }, 15_000);

    it("5. worker handles multiple functions with mixed results", async () => {
        const fnProven = mkFn({
            name: "proven",
            params: [mkParam("x", "Int")],
            contracts: [
                mkPre(mkBinop(">", mkIdent("x"), mkLit(0))),
                mkPost(mkBinop(">", mkIdent("result"), mkLit(0))),
            ],
            body: [mkIdent("x")],
        });

        const fnFailing = mkFn({
            name: "failing",
            params: [mkParam("y", "Int")],
            contracts: [
                mkPost(mkBinop(">", mkIdent("result"), mkLit(100))),
            ],
            body: [mkLit(5)], // 5 is not > 100
        });

        const result = await contractVerify(mkModule([fnProven, fnFailing]), { useWorker: true });
        // Should have exactly 1 error (from "failing")
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]!.error).toBe("contract_failure");
    }, 15_000);
});
