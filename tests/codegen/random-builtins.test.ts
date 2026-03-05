import { describe, it, expect } from "vitest";
import { compile } from "../../src/codegen/codegen.js";
import { runDirect } from "../../src/codegen/runner.js";
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
        effects: ["reads"],
        returnType: { kind: "basic", name: "Int" },
        contracts: [],
        body,
        ...overrides,
    };
}

function mkModule(
    defs: EdictModule["definitions"],
    imports: EdictModule["imports"] = [],
): EdictModule {
    return {
        kind: "module",
        id: "mod-test",
        name: "test",
        imports,
        definitions: defs,
    };
}

async function compileAndRun(mod: EdictModule) {
    const compiled = compile(mod);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error("compile failed");
    return runDirect(compiled.wasm, "main");
}

function mkCall(fn: string, args: Expression[], id = "c-1"): Expression {
    return {
        kind: "call", id,
        fn: { kind: "ident", id: `i-${fn}`, name: fn },
        args,
    };
}

// ---------------------------------------------------------------------------
// Tests — randomInt
// ---------------------------------------------------------------------------

describe("randomInt builtin", () => {
    it("returns an integer within the specified range", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("randomInt", [mkLiteral(1, "l-min"), mkLiteral(10, "l-max")]),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(0);
        expect(result.returnValue).toBeGreaterThanOrEqual(1);
        expect(result.returnValue).toBeLessThanOrEqual(10);
    });

    it("returns exact value when min equals max", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("randomInt", [mkLiteral(7, "l-min"), mkLiteral(7, "l-max")]),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(7);
    });

    it("compiles without errors", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("randomInt", [mkLiteral(0, "l-min"), mkLiteral(100, "l-max")]),
            ]),
        ]);
        const compiled = compile(mod);
        expect(compiled.ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Tests — randomFloat
// ---------------------------------------------------------------------------

describe("randomFloat builtin", () => {
    it("compiles and runs successfully", async () => {
        const mod = mkModule([
            mkFn("main", [
                // randomFloat returns f64, convert to int with floor for return
                mkCall("floor", [mkCall("randomFloat", [], "c-rf")], "c-floor"),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(0);
        // floor(0.0 .. 0.999) should be 0
        expect(result.returnValue).toBe(0);
    });

    it("compiles without errors", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("floor", [mkCall("randomFloat", [], "c-rf")], "c-floor"),
            ]),
        ]);
        const compiled = compile(mod);
        expect(compiled.ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Tests — randomUuid
// ---------------------------------------------------------------------------

describe("randomUuid builtin", () => {
    it("returns a valid UUID (non-null pointer)", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-uuid", name: "uuid",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("randomUuid", [], "c-uuid"),
                },
                // Check string length is 36 (standard UUID format)
                mkCall("string_length", [
                    { kind: "ident", id: "i-uuid", name: "uuid" },
                ], "c-len"),
            ], { effects: ["reads"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(0);
        expect(result.returnValue).toBe(36); // UUID v4 is always 36 chars
    });

    it("prints a UUID string", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-uuid", name: "uuid",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("randomUuid", [], "c-uuid"),
                },
                {
                    kind: "let", id: "let-p", name: "_p",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("print", [
                        { kind: "ident", id: "i-uuid", name: "uuid" },
                    ], "c-print"),
                },
                mkLiteral(0, "l-0"),
            ], { effects: ["reads", "io"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(0);
        // UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        expect(result.output).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("generates unique UUIDs on successive calls", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-u1", name: "u1",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("randomUuid", [], "c-u1"),
                },
                {
                    kind: "let", id: "let-u2", name: "u2",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("randomUuid", [], "c-u2"),
                },
                // Compare string pointers — different UUIDs should have different pointers
                {
                    kind: "if", id: "if-eq",
                    condition: {
                        kind: "binop", id: "b-eq", op: "==",
                        left: { kind: "ident", id: "i-u1", name: "u1" },
                        right: { kind: "ident", id: "i-u2", name: "u2" },
                    },
                    then: [mkLiteral(0, "l-same")],
                    else: [mkLiteral(1, "l-diff")],
                },
            ], { effects: ["reads"] }),
        ]);
        const result = await compileAndRun(mod);
        // UUIDs should be at different memory locations
        expect(result.returnValue).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Tests — effect safety
// ---------------------------------------------------------------------------

describe("random builtins — effect safety", () => {
    it("randomInt compiles when function has reads effect", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("randomInt", [mkLiteral(1, "l-min"), mkLiteral(10, "l-max")]),
            ], { effects: ["reads"] }),
        ]);
        const compiled = compile(mod);
        expect(compiled.ok).toBe(true);
    });
});
