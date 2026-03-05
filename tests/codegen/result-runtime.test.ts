import { describe, it, expect } from "vitest";
import { compile } from "../../src/codegen/codegen.js";
import { runDirect } from "../../src/codegen/runner.js";
import type { EdictModule, FunctionDef, Expression } from "../../src/ast/nodes.js";

// ---------------------------------------------------------------------------
// Helpers (same pattern as option-runtime.test.ts)
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
// Result construction helpers
// ---------------------------------------------------------------------------

function mkOk(value: Expression, id = "ec-ok"): Expression {
    return {
        kind: "enum_constructor",
        id,
        enumName: "Result",
        variant: "Ok",
        fields: [{ kind: "field_init", name: "value", value }],
    };
}

function mkErr(error: Expression, id = "ec-err"): Expression {
    return {
        kind: "enum_constructor",
        id,
        enumName: "Result",
        variant: "Err",
        fields: [{ kind: "field_init", name: "error", value: error }],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Result runtime — construction", () => {
    it("Ok(42) returns a valid heap pointer", async () => {
        const mod = mkModule([
            mkFn("main", [mkOk(mkLiteral(42, "l-v"))]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(0);
        expect(result.returnValue).toBeGreaterThan(0);
    });

    it("Err(1) returns a valid heap pointer", async () => {
        const mod = mkModule([
            mkFn("main", [mkErr(mkLiteral(1, "l-e"))]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(0);
        expect(result.returnValue).toBeGreaterThan(0);
    });
});

describe("Result runtime — match", () => {
    it("matches Ok and extracts the value", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkOk(mkLiteral(42, "l-v")),
                },
                {
                    kind: "match", id: "m-1",
                    target: { kind: "ident", id: "i-res", name: "res" },
                    arms: [
                        {
                            id: "arm-ok",
                            pattern: { kind: "constructor", name: "Ok", fields: [{ kind: "binding", name: "val" }] },
                            body: [{ kind: "ident", id: "i-val", name: "val" }],
                        },
                        {
                            id: "arm-err",
                            pattern: { kind: "constructor", name: "Err", fields: [{ kind: "binding", name: "e" }] },
                            body: [mkLiteral(0, "l-0")],
                        },
                    ],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(42);
    });

    it("matches Err and extracts the error", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkErr(mkLiteral(99, "l-e")),
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
                            body: [{ kind: "ident", id: "i-e", name: "e" }],
                        },
                    ],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(99);
    });

    it("match with wildcard on Result", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkOk(mkLiteral(10, "l-10")),
                },
                {
                    kind: "match", id: "m-1",
                    target: { kind: "ident", id: "i-res", name: "res" },
                    arms: [
                        {
                            id: "arm-ok",
                            pattern: { kind: "constructor", name: "Ok", fields: [{ kind: "binding", name: "val" }] },
                            body: [{ kind: "ident", id: "i-val", name: "val" }],
                        },
                        {
                            id: "arm-wild",
                            pattern: { kind: "wildcard" },
                            body: [mkLiteral(0, "l-0")],
                        },
                    ],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(10);
    });
});

describe("Result runtime — utility builtins", () => {
    it("isOk(Ok(42)) returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-isOk", name: "isOk" },
                    args: [mkOk(mkLiteral(42, "l-v"))],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
    });

    it("isOk(Err(1)) returns 0", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-isOk", name: "isOk" },
                    args: [mkErr(mkLiteral(1, "l-e"))],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(0);
    });

    it("isErr(Err(1)) returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-isErr", name: "isErr" },
                    args: [mkErr(mkLiteral(1, "l-e"))],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
    });

    it("isErr(Ok(42)) returns 0", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-isErr", name: "isErr" },
                    args: [mkOk(mkLiteral(42, "l-v"))],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(0);
    });

    it("unwrapOk(Ok(42)) returns 42", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-unwrapOk", name: "unwrapOk" },
                    args: [mkOk(mkLiteral(42, "l-v"))],
                },
            ], { effects: ["fails"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(42);
    });

    it("unwrapOk(Err(1)) traps with exitCode 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-unwrapOk", name: "unwrapOk" },
                    args: [mkErr(mkLiteral(1, "l-e"))],
                },
            ], { effects: ["fails"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(1);
        expect(result.output).toContain("unwrapOk called on Err");
    });

    it("unwrapErr(Err(99)) returns 99", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-unwrapErr", name: "unwrapErr" },
                    args: [mkErr(mkLiteral(99, "l-e"))],
                },
            ], { effects: ["fails"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(99);
    });

    it("unwrapErr(Ok(42)) traps with exitCode 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-unwrapErr", name: "unwrapErr" },
                    args: [mkOk(mkLiteral(42, "l-v"))],
                },
            ], { effects: ["fails"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(1);
        expect(result.output).toContain("unwrapErr called on Ok");
    });

    it("unwrapOkOr(Ok(42), 0) returns 42", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-unwrapOkOr", name: "unwrapOkOr" },
                    args: [mkOk(mkLiteral(42, "l-v")), mkLiteral(0, "l-def")],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(42);
    });

    it("unwrapOkOr(Err(1), 99) returns 99", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-unwrapOkOr", name: "unwrapOkOr" },
                    args: [mkErr(mkLiteral(1, "l-e")), mkLiteral(99, "l-def")],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(99);
    });

    it("unwrapErrOr(Err(99), 0) returns 99", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-unwrapErrOr", name: "unwrapErrOr" },
                    args: [mkErr(mkLiteral(99, "l-e")), mkLiteral(0, "l-def")],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(99);
    });

    it("unwrapErrOr(Ok(42), 0) returns 0", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "call", id: "c-1",
                    fn: { kind: "ident", id: "i-unwrapErrOr", name: "unwrapErrOr" },
                    args: [mkOk(mkLiteral(42, "l-v")), mkLiteral(0, "l-def")],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(0);
    });
});

describe("Result runtime — function return", () => {
    it("function returns Ok via enum_constructor", async () => {
        const mod = mkModule([
            mkFn("safeDivide", [
                {
                    kind: "if", id: "if-1",
                    condition: {
                        kind: "binop", id: "b-eq", op: "==",
                        left: { kind: "ident", id: "i-b", name: "b" },
                        right: mkLiteral(0, "l-0"),
                    },
                    then: [mkErr(mkLiteral(-1, "l-err"), "ec-err-div")],
                    else: [mkOk({
                        kind: "binop", id: "b-div", op: "/",
                        left: { kind: "ident", id: "i-a", name: "a" },
                        right: { kind: "ident", id: "i-b2", name: "b" },
                    }, "ec-ok-div")],
                },
            ], {
                params: [
                    { kind: "param", id: "p-a", name: "a", type: { kind: "basic", name: "Int" } },
                    { kind: "param", id: "p-b", name: "b", type: { kind: "basic", name: "Int" } },
                ],
                returnType: { kind: "named", name: "Result" },
            }),
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: {
                        kind: "call", id: "c-div",
                        fn: { kind: "ident", id: "i-div", name: "safeDivide" },
                        args: [mkLiteral(10, "l-10"), mkLiteral(2, "l-2")],
                    },
                },
                {
                    kind: "match", id: "m-1",
                    target: { kind: "ident", id: "i-res", name: "res" },
                    arms: [
                        {
                            id: "arm-ok",
                            pattern: { kind: "constructor", name: "Ok", fields: [{ kind: "binding", name: "v" }] },
                            body: [{ kind: "ident", id: "i-v", name: "v" }],
                        },
                        {
                            id: "arm-err",
                            pattern: { kind: "constructor", name: "Err", fields: [{ kind: "binding", name: "e" }] },
                            body: [{ kind: "ident", id: "i-e", name: "e" }],
                        },
                    ],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(5); // 10 / 2 = 5
    });

    it("function returns Err on division by zero", async () => {
        const mod = mkModule([
            mkFn("safeDivide", [
                {
                    kind: "if", id: "if-1",
                    condition: {
                        kind: "binop", id: "b-eq", op: "==",
                        left: { kind: "ident", id: "i-b", name: "b" },
                        right: mkLiteral(0, "l-0"),
                    },
                    then: [mkErr(mkLiteral(-1, "l-err"), "ec-err-div")],
                    else: [mkOk({
                        kind: "binop", id: "b-div", op: "/",
                        left: { kind: "ident", id: "i-a", name: "a" },
                        right: { kind: "ident", id: "i-b2", name: "b" },
                    }, "ec-ok-div")],
                },
            ], {
                params: [
                    { kind: "param", id: "p-a", name: "a", type: { kind: "basic", name: "Int" } },
                    { kind: "param", id: "p-b", name: "b", type: { kind: "basic", name: "Int" } },
                ],
                returnType: { kind: "named", name: "Result" },
            }),
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: {
                        kind: "call", id: "c-div",
                        fn: { kind: "ident", id: "i-div", name: "safeDivide" },
                        args: [mkLiteral(10, "l-10"), mkLiteral(0, "l-0-arg")],
                    },
                },
                {
                    kind: "match", id: "m-1",
                    target: { kind: "ident", id: "i-res", name: "res" },
                    arms: [
                        {
                            id: "arm-ok",
                            pattern: { kind: "constructor", name: "Ok", fields: [{ kind: "binding", name: "v" }] },
                            body: [{ kind: "ident", id: "i-v", name: "v" }],
                        },
                        {
                            id: "arm-err",
                            pattern: { kind: "constructor", name: "Err", fields: [{ kind: "binding", name: "e" }] },
                            body: [{ kind: "ident", id: "i-e", name: "e" }],
                        },
                    ],
                },
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(-1); // error code
    });
});
