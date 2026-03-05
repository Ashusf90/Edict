import { describe, it, expect } from "vitest";
import { compile } from "../../src/codegen/codegen.js";
import { runDirect } from "../../src/codegen/runner.js";
import type { EdictModule, FunctionDef, Expression } from "../../src/ast/nodes.js";

// ---------------------------------------------------------------------------
// Helpers (same pattern as result-runtime.test.ts)
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

// ---------------------------------------------------------------------------
// Call helpers
// ---------------------------------------------------------------------------

function mkCall(fn: string, args: Expression[], id = "c-1"): Expression {
    return {
        kind: "call", id,
        fn: { kind: "ident", id: `i-${fn}`, name: fn },
        args,
    };
}

// ---------------------------------------------------------------------------
// Tests — jsonParse
// ---------------------------------------------------------------------------

describe("jsonParse builtin", () => {
    it("valid JSON object → isOk returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("jsonParse", [mkLiteral('{"key":"value"}', "l-json")]),
                },
                mkCall("isOk", [{ kind: "ident", id: "i-res", name: "res" }], "c-isOk"),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
    });

    it("valid JSON array → isOk returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("jsonParse", [mkLiteral("[1,2,3]", "l-json")]),
                },
                mkCall("isOk", [{ kind: "ident", id: "i-res", name: "res" }], "c-isOk"),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
    });

    it("valid JSON number → isOk returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("jsonParse", [mkLiteral("42", "l-json")]),
                },
                mkCall("isOk", [{ kind: "ident", id: "i-res", name: "res" }], "c-isOk"),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
    });

    it("invalid JSON → isErr returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("jsonParse", [mkLiteral("{invalid json}", "l-bad")]),
                },
                mkCall("isErr", [{ kind: "ident", id: "i-res", name: "res" }], "c-isErr"),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
    });

    it("empty string → isErr returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("jsonParse", [mkLiteral("", "l-empty")]),
                },
                mkCall("isErr", [{ kind: "ident", id: "i-res", name: "res" }], "c-isErr"),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
    });

    it("valid JSON → match Ok, print original string", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("jsonParse", [mkLiteral('{"hello":"world"}', "l-json")]),
                },
                {
                    kind: "match", id: "m-1",
                    target: { kind: "ident", id: "i-res", name: "res" },
                    arms: [
                        {
                            id: "arm-ok",
                            pattern: { kind: "constructor", name: "Ok", fields: [{ kind: "binding", name: "val" }] },
                            body: [
                                {
                                    kind: "let", id: "let-p", name: "_p",
                                    type: { kind: "basic", name: "String" },
                                    value: mkCall("print", [{ kind: "ident", id: "i-val", name: "val" }], "c-print"),
                                },
                                mkLiteral(1, "l-1"),
                            ],
                        },
                        {
                            id: "arm-err",
                            pattern: { kind: "constructor", name: "Err", fields: [{ kind: "binding", name: "e" }] },
                            body: [mkLiteral(0, "l-0")],
                        },
                    ],
                },
            ], { effects: ["io"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
        expect(result.output).toContain("hello");
    });

    it("invalid JSON → match Err, error message is non-empty", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("jsonParse", [mkLiteral("not json", "l-bad")]),
                },
                {
                    kind: "match", id: "m-1",
                    target: { kind: "ident", id: "i-res", name: "res" },
                    arms: [
                        {
                            id: "arm-ok",
                            pattern: { kind: "constructor", name: "Ok", fields: [{ kind: "binding", name: "val" }] },
                            body: [mkLiteral(0, "l-0")],
                        },
                        {
                            id: "arm-err",
                            pattern: { kind: "constructor", name: "Err", fields: [{ kind: "binding", name: "e" }] },
                            body: [
                                {
                                    kind: "let", id: "let-p", name: "_p",
                                    type: { kind: "basic", name: "String" },
                                    value: mkCall("print", [{ kind: "ident", id: "i-e", name: "e" }], "c-print"),
                                },
                                mkLiteral(1, "l-1"),
                            ],
                        },
                    ],
                },
            ], { effects: ["io"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
        // Error message should mention something about JSON parsing
        expect(result.output.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Tests — jsonStringify
// ---------------------------------------------------------------------------

describe("jsonStringify builtin", () => {
    it("normalizes JSON with extra whitespace", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("print", [
                    mkCall("jsonStringify", [mkLiteral('{  "key" :  "value"  }', "l-json")], "c-stringify"),
                ], "c-print"),
                mkLiteral(0, "l-0"),
            ], { effects: ["io"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.output).toBe('{"key":"value"}');
    });

    it("preserves compact JSON", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("print", [
                    mkCall("jsonStringify", [mkLiteral('{"a":1,"b":2}', "l-json")], "c-stringify"),
                ], "c-print"),
                mkLiteral(0, "l-0"),
            ], { effects: ["io"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.output).toBe('{"a":1,"b":2}');
    });

    it("normalizes JSON array", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("print", [
                    mkCall("jsonStringify", [mkLiteral("[  1,  2,  3  ]", "l-json")], "c-stringify"),
                ], "c-print"),
                mkLiteral(0, "l-0"),
            ], { effects: ["io"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.output).toBe("[1,2,3]");
    });

    it("handles invalid JSON by returning input unchanged", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("print", [
                    mkCall("jsonStringify", [mkLiteral("not json", "l-bad")], "c-stringify"),
                ], "c-print"),
                mkLiteral(0, "l-0"),
            ], { effects: ["io"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.output).toBe("not json");
    });
});

// ---------------------------------------------------------------------------
// Tests — compilation pipeline
// ---------------------------------------------------------------------------

describe("JSON builtins — compilation pipeline", () => {
    it("jsonParse compiles without errors", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("jsonParse", [mkLiteral('{"a":1}', "l-json")]),
                },
                mkLiteral(0, "l-0"),
            ]),
        ]);
        const compiled = compile(mod);
        expect(compiled.ok).toBe(true);
    });

    it("jsonStringify compiles without errors", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("print", [
                    mkCall("jsonStringify", [mkLiteral('{"a":1}', "l-json")], "c-stringify"),
                ], "c-print"),
                mkLiteral(0, "l-0"),
            ], { effects: ["io"] }),
        ]);
        const compiled = compile(mod);
        expect(compiled.ok).toBe(true);
    });
});
