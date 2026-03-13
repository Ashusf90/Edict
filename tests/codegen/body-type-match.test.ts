import { describe, it, expect } from "vitest";
import { compile } from "../../src/codegen/codegen.js";
import { check } from "../../src/check.js";
import type { EdictModule, FunctionDef, Expression } from "../../src/ast/nodes.js";
import type { TypeExpr } from "../../src/ast/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkLiteral(value: number | string | boolean, id = "l-1", type?: TypeExpr): Expression {
    return type ? { kind: "literal", id, value, type } : { kind: "literal", id, value };
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

// ---------------------------------------------------------------------------
// Regression: function body type must match (v1.11.0)
//
// The type checker models `let` as producing the value type and `if` without
// `else` as producing Option<T>, but the codegen emits void instructions.
// These tests verify the codegen now produces matching WASM types.
// ---------------------------------------------------------------------------

describe("body-type-match — let as last expression", () => {
    it("compiles fn body ending with let (explicit Int returnType)", () => {
        const mod = mkModule([
            mkFn("main", [
                { kind: "let", id: "let-1", name: "x", value: mkLiteral(42) },
            ]),
        ]);
        const result = compile(mod);
        expect(result.ok).toBe(true);
    });

    it("compiles fn body ending with let (explicit Float returnType)", () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-1", name: "x",
                    type: { kind: "basic", name: "Float" },
                    value: mkLiteral(3.14, "l-1", { kind: "basic", name: "Float" }),
                },
            ], { returnType: { kind: "basic", name: "Float" } }),
        ]);
        const result = compile(mod);
        expect(result.ok).toBe(true);
    });

    it("compiles fn body ending with let (inferred return type via typeInfo)", async () => {
        const ast: EdictModule = {
            kind: "module", id: "mod-1", name: "test",
            imports: [],
            definitions: [
                {
                    kind: "fn", id: "fn-main", name: "main",
                    params: [], effects: ["pure"], contracts: [],
                    body: [
                        { kind: "let", id: "let-1", name: "x", value: { kind: "literal", id: "l-1", value: 42 } },
                    ],
                },
            ],
        };
        const checkResult = await check(ast);
        expect(checkResult.ok).toBe(true);
        if (!checkResult.ok) return;
        const compileResult = compile(ast, { typeInfo: checkResult.typeInfo });
        expect(compileResult.ok).toBe(true);
    });

    it("control: let then ident still works", () => {
        const mod = mkModule([
            mkFn("main", [
                { kind: "let", id: "let-1", name: "x", value: mkLiteral(10) },
                { kind: "ident", id: "id-1", name: "x" },
            ]),
        ]);
        const result = compile(mod);
        expect(result.ok).toBe(true);
    });
});

describe("body-type-match — block ending with let", () => {
    it("compiles fn body with block { let x = 42 }", () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "block", id: "blk-1",
                    body: [
                        { kind: "let", id: "let-1", name: "x", value: mkLiteral(42) },
                    ],
                },
            ]),
        ]);
        const result = compile(mod);
        expect(result.ok).toBe(true);
    });
});

describe("body-type-match — if without else (Option)", () => {
    it("compiles if without else (Int then-branch)", () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "if", id: "if-1",
                    condition: mkLiteral(true, "l-cond"),
                    then: [mkLiteral(42, "l-then")],
                },
            ], {
                params: [],
                returnType: { kind: "option", inner: { kind: "basic", name: "Int" } },
            }),
        ]);
        const result = compile(mod);
        expect(result.ok).toBe(true);
    });

    it("compiles if without else (Float then-branch)", () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "if", id: "if-1",
                    condition: mkLiteral(true, "l-cond"),
                    then: [mkLiteral(3.14, "l-then", { kind: "basic", name: "Float" })],
                },
            ], {
                params: [],
                returnType: { kind: "option", inner: { kind: "basic", name: "Float" } },
            }),
        ]);
        const result = compile(mod);
        expect(result.ok).toBe(true);
    });

    it("compiles if without else via full pipeline (check + compile)", async () => {
        const ast: EdictModule = {
            kind: "module", id: "mod-1", name: "test",
            imports: [],
            definitions: [
                {
                    kind: "fn", id: "fn-main", name: "main",
                    params: [
                        { kind: "param", id: "p-b", name: "b", type: { kind: "basic", name: "Bool" } },
                    ],
                    effects: ["pure"], contracts: [],
                    body: [
                        {
                            kind: "if", id: "if-1",
                            condition: { kind: "ident", id: "id-b", name: "b" },
                            then: [{ kind: "literal", id: "l-1", value: 42 }],
                        },
                    ],
                },
            ],
        };
        const checkResult = await check(ast);
        expect(checkResult.ok).toBe(true);
        if (!checkResult.ok) return;
        const compileResult = compile(ast, { typeInfo: checkResult.typeInfo });
        expect(compileResult.ok).toBe(true);
    });
});
