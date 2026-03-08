import { describe, it, expect } from "vitest";
import { compile } from "../../src/codegen/codegen.js";
import { runDebug } from "../../src/codegen/runner.js";
import type { EdictModule, FunctionDef, Expression } from "../../src/ast/nodes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkLiteral(value: number | string | boolean, id = "l-1"): Expression {
    return { kind: "literal", id, value };
}

function mkFn(
    name: string,
    body: Expression[],
    overrides: Partial<FunctionDef> = {},
): FunctionDef {
    return {
        kind: "fn",
        id: `fn-${name}`,
        name,
        params: [],
        effects: ["pure"],
        returnType: { kind: "basic", name: "Int" },
        contracts: [],
        body,
        ...overrides,
    };
}

function mkModule(defs: EdictModule["definitions"]): EdictModule {
    return {
        kind: "module",
        id: "mod-test",
        name: "test",
        imports: [],
        definitions: defs,
    };
}

/** Compile with debug mode and run via runDebug */
async function compileAndDebug(mod: EdictModule, maxSteps?: number) {
    const compiled = compile(mod, { debugMode: true });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error("Compilation failed");
    expect(compiled.debugMetadata).toBeDefined();
    return runDebug(compiled.wasm, compiled.debugMetadata!, { maxSteps });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("debug — compile metadata", () => {
    it("debugMetadata contains fnMap with correct entries", () => {
        const mod = mkModule([
            mkFn("helper", [mkLiteral(1, "l-h")]),
            mkFn("main", [mkLiteral(42)]),
        ]);
        const compiled = compile(mod, { debugMode: true });
        expect(compiled.ok).toBe(true);
        if (!compiled.ok) return;
        expect(compiled.debugMetadata).toBeDefined();
        expect(compiled.debugMetadata!.fnMap).toEqual({
            helper: "fn-helper",
            main: "fn-main",
        });
    });

    it("non-debug compile has no debugMetadata", () => {
        const mod = mkModule([mkFn("main", [mkLiteral(42)])]);
        const compiled = compile(mod);
        expect(compiled.ok).toBe(true);
        if (!compiled.ok) return;
        expect(compiled.debugMetadata).toBeUndefined();
    });
});

describe("debug — normal execution", () => {
    it("returns correct result with stepsExecuted", async () => {
        const mod = mkModule([mkFn("main", [mkLiteral(42)])]);
        const result = await compileAndDebug(mod);

        expect(result.exitCode).toBe(0);
        expect(result.returnValue).toBe(42);
        expect(result.stepsExecuted).toBeGreaterThanOrEqual(1); // at minimum, main was entered
        expect(result.callStack).toBeUndefined();
        expect(result.crashLocation).toBeUndefined();
        expect(result.error).toBeUndefined();
    });

    it("cross-function call increments steps", async () => {
        const mod = mkModule([
            mkFn("helper", [mkLiteral(10, "l-h")]),
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-h", name: "helper" },
                    args: [],
                },
            ]),
        ]);
        const result = await compileAndDebug(mod);

        expect(result.exitCode).toBe(0);
        expect(result.returnValue).toBe(10);
        expect(result.stepsExecuted).toBeGreaterThanOrEqual(2); // main + helper
    });

    it("captures print output in debug mode", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-p", name: "print" },
                    args: [mkLiteral("hello debug", "l-s")],
                },
                mkLiteral(0, "l-ret"),
            ], { effects: ["io"] }),
        ]);
        const result = await compileAndDebug(mod);

        expect(result.exitCode).toBe(0);
        expect(result.output).toBe("hello debug");
    });
});

describe("debug — crash diagnostics", () => {
    it("call stack on crash: main → helper", async () => {
        // helper calls unreachable (division by zero via 1/0)
        const mod = mkModule([
            mkFn("helper", [
                {
                    kind: "binop", id: "b-div", op: "/",
                    left: mkLiteral(1, "l-one"),
                    right: mkLiteral(0, "l-zero"),
                },
            ]),
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-h", name: "helper" },
                    args: [],
                },
            ]),
        ]);
        const result = await compileAndDebug(mod);

        expect(result.exitCode).toBe(1);
        expect(result.callStack).toBeDefined();
        expect(result.callStack!.length).toBeGreaterThanOrEqual(1);
        // The call stack should contain helper (where the crash happened)
        expect(result.callStack).toContain("helper");
        expect(result.crashLocation).toBeDefined();
        expect(result.crashLocation!.fn).toBe("helper");
        expect(result.crashLocation!.nodeId).toBe("fn-helper");
    });
});

describe("debug — step limit", () => {
    it("step limit exceeded returns error", async () => {
        // Recursive fibonacci — will exceed a small step limit
        const fibFn = mkFn("fib", [
            {
                kind: "if", id: "if-base",
                condition: {
                    kind: "binop", id: "b-lte", op: "<=",
                    left: { kind: "ident", id: "i-n-cond", name: "n" },
                    right: mkLiteral(1, "l-1"),
                },
                then: [{ kind: "ident", id: "i-n-ret", name: "n" }],
                else: [
                    {
                        kind: "binop", id: "b-add", op: "+",
                        left: {
                            kind: "call", id: "c-fib1",
                            fn: { kind: "ident", id: "i-fib1", name: "fib" },
                            args: [{
                                kind: "binop", id: "b-sub1", op: "-",
                                left: { kind: "ident", id: "i-n1", name: "n" },
                                right: mkLiteral(1, "l-one1"),
                            }],
                        },
                        right: {
                            kind: "call", id: "c-fib2",
                            fn: { kind: "ident", id: "i-fib2", name: "fib" },
                            args: [{
                                kind: "binop", id: "b-sub2", op: "-",
                                left: { kind: "ident", id: "i-n2", name: "n" },
                                right: mkLiteral(2, "l-two"),
                            }],
                        },
                    },
                ],
            },
        ], {
            params: [{
                kind: "param", id: "p-n", name: "n",
                type: { kind: "basic", name: "Int" },
            }],
        });

        const mod = mkModule([
            fibFn,
            mkFn("main", [
                {
                    kind: "call", id: "c-main",
                    fn: { kind: "ident", id: "i-fib-main", name: "fib" },
                    args: [mkLiteral(20, "l-20")],
                },
            ]),
        ]);

        const result = await compileAndDebug(mod, 5);

        expect(result.error).toBe("step_limit_exceeded");
        expect(result.exitCode).toBe(1);
        expect(result.stepsExecuted).toBeGreaterThanOrEqual(5);
        expect(result.callStack).toBeDefined();
        expect(result.callStack!.length).toBeGreaterThan(0);
    });
});

describe("debug — edge cases", () => {
    it("missing entry function returns exitCode 1 with stepsExecuted 0", async () => {
        const mod = mkModule([mkFn("helper", [mkLiteral(0)])]);
        const compiled = compile(mod, { debugMode: true });
        expect(compiled.ok).toBe(true);
        if (!compiled.ok) return;

        const result = await runDebug(compiled.wasm, compiled.debugMetadata!, {});
        expect(result.exitCode).toBe(1);
        expect(result.stepsExecuted).toBe(0);
    });
});
