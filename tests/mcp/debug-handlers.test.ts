import { describe, it, expect } from "vitest";
import { handleDebug } from "../../src/mcp/handlers.js";

// ---------------------------------------------------------------------------
// Helpers — minimal AST fixtures
// ---------------------------------------------------------------------------

function validModule() {
    return {
        kind: "module",
        id: "mod-1",
        name: "test",
        imports: [],
        definitions: [
            {
                kind: "fn",
                id: "fn-main",
                name: "main",
                params: [],
                effects: ["pure"],
                returnType: { kind: "basic", name: "Int" },
                contracts: [],
                body: [{ kind: "literal", id: "l-1", value: 42 }],
            },
        ],
    };
}

function crashingModule() {
    return {
        kind: "module",
        id: "mod-crash",
        name: "crash_test",
        imports: [],
        definitions: [
            {
                kind: "fn",
                id: "fn-explode",
                name: "explode",
                params: [],
                effects: ["pure"],
                returnType: { kind: "basic", name: "Int" },
                contracts: [],
                body: [
                    {
                        kind: "binop", id: "b-div", op: "/",
                        left: { kind: "literal", id: "l-1", value: 1 },
                        right: { kind: "literal", id: "l-0", value: 0 },
                    },
                ],
            },
            {
                kind: "fn",
                id: "fn-main",
                name: "main",
                params: [],
                effects: ["pure"],
                returnType: { kind: "basic", name: "Int" },
                contracts: [],
                body: [
                    {
                        kind: "call", id: "c-1",
                        fn: { kind: "ident", id: "i-explode", name: "explode" },
                        args: [],
                    },
                ],
            },
        ],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleDebug — MCP handler", () => {
    it("valid AST returns ok with stepsExecuted", async () => {
        const result = await handleDebug(validModule());

        expect(result.ok).toBe(true);
        expect(result.exitCode).toBe(0);
        expect(result.returnValue).toBe(42);
        expect(result.stepsExecuted).toBeGreaterThanOrEqual(1);
        expect(result.errors).toBeUndefined();
    });

    it("crashing AST returns crashLocation", async () => {
        const result = await handleDebug(crashingModule());

        expect(result.ok).toBe(true);
        expect(result.exitCode).toBe(1);
        expect(result.crashLocation).toBeDefined();
        expect(result.crashLocation!.fn).toBe("explode");
        expect(result.crashLocation!.nodeId).toBe("fn-explode");
        expect(result.callStack).toBeDefined();
        expect(result.callStack).toContain("explode");
    });

    it("invalid AST returns compilation errors", async () => {
        const result = await handleDebug({ kind: "module", id: "m", name: "bad" });

        expect(result.ok).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("step limit option is respected", async () => {
        // Build a recursive program that will exceed a small step limit
        const recursiveModule = {
            kind: "module",
            id: "mod-rec",
            name: "recursive",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-fib",
                    name: "fib",
                    params: [{ kind: "param", id: "p-n", name: "n", type: { kind: "basic", name: "Int" } }],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{
                        kind: "if", id: "if-1",
                        condition: {
                            kind: "binop", id: "b-lte", op: "<=",
                            left: { kind: "ident", id: "i-n", name: "n" },
                            right: { kind: "literal", id: "l-1", value: 1 },
                        },
                        then: [{ kind: "ident", id: "i-n2", name: "n" }],
                        else: [{
                            kind: "binop", id: "b-add", op: "+",
                            left: {
                                kind: "call", id: "c-f1",
                                fn: { kind: "ident", id: "i-f1", name: "fib" },
                                args: [{
                                    kind: "binop", id: "b-s1", op: "-",
                                    left: { kind: "ident", id: "i-n3", name: "n" },
                                    right: { kind: "literal", id: "l-one", value: 1 },
                                }],
                            },
                            right: {
                                kind: "call", id: "c-f2",
                                fn: { kind: "ident", id: "i-f2", name: "fib" },
                                args: [{
                                    kind: "binop", id: "b-s2", op: "-",
                                    left: { kind: "ident", id: "i-n4", name: "n" },
                                    right: { kind: "literal", id: "l-two", value: 2 },
                                }],
                            },
                        }],
                    }],
                },
                {
                    kind: "fn",
                    id: "fn-main",
                    name: "main",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{
                        kind: "call", id: "c-main",
                        fn: { kind: "ident", id: "i-fib", name: "fib" },
                        args: [{ kind: "literal", id: "l-20", value: 20 }],
                    }],
                },
            ],
        };

        const result = await handleDebug(recursiveModule, { maxSteps: 5 });

        expect(result.ok).toBe(true);
        expect(result.error).toBe("step_limit_exceeded");
        expect(result.stepsExecuted).toBeGreaterThanOrEqual(5);
    });
});
