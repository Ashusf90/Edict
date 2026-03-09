import { describe, it, expect } from "vitest";
import { complexityCheck } from "../../src/checker/complexity.js";
import type { EdictModule, FunctionDef, Expression } from "../../src/ast/nodes.js";

function createModule(def: FunctionDef, budget?: any): EdictModule {
    return {
        kind: "module",
        id: "mod-001",
        name: "test_module",
        imports: [],
        budget,
        definitions: [def],
    };
}

function createFn(name: string, body: Expression[], constraints?: any): FunctionDef {
    return {
        kind: "fn",
        id: `fn-${name}`,
        name,
        params: [],
        effects: ["pure"],
        returnType: { kind: "basic", name: "Int" },
        contracts: [],
        constraints,
        body,
    };
}

describe("Complexity Checker", () => {
    it("allows a function within its AST node budget", () => {
        const fn = createFn("main", [
            { kind: "literal", id: "lit-1", value: 42 }
        ], { maxAstNodes: 10 });
        const module = createModule(fn);
        const errors = complexityCheck(module);
        expect(errors).toHaveLength(0);
    });

    it("rejects a function exceeding AST node budget", () => {
        // fn node (1) + literal node (1) = 2 nodes for the function body
        const fn = createFn("main", [
            { kind: "literal", id: "lit-1", value: 42 }
        ], { maxAstNodes: 1 });
        const module = createModule(fn);
        const errors = complexityCheck(module);
        expect(errors).toHaveLength(1);
        expect(errors[0].error).toBe("function_complexity_exceeded");
        // @ts-ignore
        expect(errors[0].metric).toBe("maxAstNodes");
    });

    it("evaluates maximum call depth correctly", () => {
        // nested binops
        const fn = createFn("main", [
            {
                kind: "binop", id: "b1", op: "+",
                left: { kind: "literal", id: "l1", value: 1 },
                right: {
                    kind: "binop", id: "b2", op: "+",
                    left: { kind: "literal", id: "l2", value: 2 },
                    right: { kind: "literal", id: "l3", value: 3 }
                }
            }
        ], { maxCallDepth: 2 });
        const module = createModule(fn);
        const errors = complexityCheck(module);
        expect(errors).toHaveLength(1);
        expect(errors[0].error).toBe("function_complexity_exceeded");
        // @ts-ignore
        expect(errors[0].metric).toBe("maxCallDepth");
    });

    it("evaluates maximum branches correctly", () => {
        const fn = createFn("main", [
            {
                kind: "if", id: "i1",
                condition: { kind: "literal", id: "c1", value: true },
                then: [{ kind: "literal", id: "t1", value: 1 }],
                else: [{ kind: "literal", id: "e1", value: 2 }]
            }
        ], { maxBranches: 0 }); // if creates 1 branch
        const module = createModule(fn);
        const errors = complexityCheck(module);
        expect(errors).toHaveLength(1);
        expect(errors[0].error).toBe("function_complexity_exceeded");
        // @ts-ignore
        expect(errors[0].metric).toBe("maxBranches");
    });

    it("enforces module-level overarching budgets", () => {
        const fn = createFn("main", [
            { kind: "literal", id: "lit-1", value: 42 }
        ]);
        const moduleFail = createModule(fn, { maxAstNodes: 0 });
        const errorsFail = complexityCheck(moduleFail);
        expect(errorsFail).toHaveLength(1);
        expect(errorsFail[0].error).toBe("module_complexity_exceeded");
    });
});
