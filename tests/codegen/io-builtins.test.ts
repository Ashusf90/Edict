// =============================================================================
// IO Builtins — E2E Tests
// =============================================================================
// Compile+run Edict programs using readFile, writeFile, env, args, exit
// builtins. File IO tests use a temp directory as sandbox.
// Uses compile()+runDirect() pattern — fs operations are synchronous
// and don't need a worker thread (unlike HTTP builtins).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compile } from "../../src/codegen/codegen.js";
import { runDirect } from "../../src/codegen/runner.js";
import type { EdictModule, FunctionDef, Expression } from "../../src/ast/nodes.js";

// =============================================================================
// Temp sandbox directory
// =============================================================================

let sandboxDir: string;

beforeAll(() => {
    sandboxDir = mkdtempSync(join(tmpdir(), "edict-io-test-"));
});

afterAll(() => {
    rmSync(sandboxDir, { recursive: true, force: true });
});

// =============================================================================
// AST helpers (same pattern as http-builtins.test.ts)
// =============================================================================

function mkLiteral(value: number | string | boolean, id = "l-1"): Expression {
    return { kind: "literal", id, value };
}

function mkCall(fn: string, args: Expression[], id = "c-1"): Expression {
    return {
        kind: "call", id,
        fn: { kind: "ident", id: `i-${fn}`, name: fn },
        args,
    };
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
        effects: ["io"],
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

async function compileAndRun(mod: EdictModule, sandbox?: string) {
    const compiled = compile(mod);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(`compile failed: ${compiled.errors.join(", ")}`);
    return runDirect(compiled.wasm, "main", { sandboxDir: sandbox });
}

// =============================================================================
// readFile
// =============================================================================

describe("readFile builtin", () => {
    it("reads a file successfully → isOk returns 1", async () => {
        writeFileSync(join(sandboxDir, "test.txt"), "hello edict");
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("readFile", [mkLiteral(join(sandboxDir, "test.txt"), "l-path")]),
                },
                mkCall("isOk", [{ kind: "ident", id: "i-res", name: "res" }], "c-isOk"),
            ]),
        ]);
        const result = await compileAndRun(mod, sandboxDir);
        expect(result.returnValue).toBe(1);
    });

    it("reads file contents via unwrapOk + print", async () => {
        writeFileSync(join(sandboxDir, "content.txt"), "file-content-here");
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("readFile", [mkLiteral(join(sandboxDir, "content.txt"), "l-path")]),
                },
                {
                    kind: "let", id: "let-body", name: "body",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("unwrapOk", [{ kind: "ident", id: "i-res", name: "res" }], "c-unwrap"),
                },
                mkCall("print", [{ kind: "ident", id: "i-body", name: "body" }], "c-print"),
                mkLiteral(0, "l-ret"),
            ]),
        ]);
        const result = await compileAndRun(mod, sandboxDir);
        expect(result.output).toBe("file-content-here");
    });

    it("nonexistent file → isErr returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("readFile", [mkLiteral(join(sandboxDir, "nonexistent.txt"), "l-path")]),
                },
                mkCall("isErr", [{ kind: "ident", id: "i-res", name: "res" }], "c-isErr"),
            ]),
        ]);
        const result = await compileAndRun(mod, sandboxDir);
        expect(result.returnValue).toBe(1);
    });

    it("path outside sandbox → isErr returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("readFile", [mkLiteral("/etc/passwd", "l-path")]),
                },
                mkCall("isErr", [{ kind: "ident", id: "i-res", name: "res" }], "c-isErr"),
            ]),
        ]);
        const result = await compileAndRun(mod, sandboxDir);
        expect(result.returnValue).toBe(1);
    });

    it("no sandbox configured → isErr returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("readFile", [mkLiteral("any.txt", "l-path")]),
                },
                mkCall("isErr", [{ kind: "ident", id: "i-res", name: "res" }], "c-isErr"),
            ]),
        ]);
        // No sandboxDir passed
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(1);
    });
});

// =============================================================================
// writeFile
// =============================================================================

describe("writeFile builtin", () => {
    it("writes a file successfully → isOk returns 1", async () => {
        const filePath = join(sandboxDir, "written.txt");
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("writeFile", [
                        mkLiteral(filePath, "l-path"),
                        mkLiteral("written-content", "l-content"),
                    ]),
                },
                mkCall("isOk", [{ kind: "ident", id: "i-res", name: "res" }], "c-isOk"),
            ]),
        ]);
        const result = await compileAndRun(mod, sandboxDir);
        expect(result.returnValue).toBe(1);
        // Verify file was actually written
        expect(readFileSync(filePath, "utf-8")).toBe("written-content");
    });

    it("path outside sandbox → isErr returns 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-res", name: "res",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("writeFile", [
                        mkLiteral("/tmp/edict-evil-write.txt", "l-path"),
                        mkLiteral("evil", "l-content"),
                    ]),
                },
                mkCall("isErr", [{ kind: "ident", id: "i-res", name: "res" }], "c-isErr"),
            ]),
        ]);
        const result = await compileAndRun(mod, sandboxDir);
        expect(result.returnValue).toBe(1);
    });

    it("writeFile + readFile roundtrip", async () => {
        const filePath = join(sandboxDir, "roundtrip.txt");
        const mod = mkModule([
            mkFn("main", [
                // Write content
                {
                    kind: "let", id: "let-w", name: "_w",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("writeFile", [
                        mkLiteral(filePath, "l-path"),
                        mkLiteral("roundtrip-data", "l-content"),
                    ]),
                },
                // Read it back
                {
                    kind: "let", id: "let-r", name: "r",
                    type: { kind: "named", name: "Result" },
                    value: mkCall("readFile", [mkLiteral(filePath, "l-path2")]),
                },
                {
                    kind: "let", id: "let-body", name: "body",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("unwrapOk", [{ kind: "ident", id: "i-r", name: "r" }], "c-unwrap"),
                },
                mkCall("print", [{ kind: "ident", id: "i-body", name: "body" }], "c-print"),
                mkLiteral(0, "l-ret"),
            ]),
        ]);
        const result = await compileAndRun(mod, sandboxDir);
        expect(result.output).toBe("roundtrip-data");
    });
});

// =============================================================================
// env
// =============================================================================

describe("env builtin", () => {
    it("reads existing env var", async () => {
        // PATH is always set
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-val", name: "val",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("env", [mkLiteral("PATH", "l-name")]),
                },
                // Use string_length to verify it's non-empty
                mkCall("string_length", [{ kind: "ident", id: "i-val", name: "val" }], "c-len"),
            ], { effects: ["reads"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBeGreaterThan(0);
    });

    it("missing env var → empty string (length 0)", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-val", name: "val",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("env", [mkLiteral("EDICT_NONEXISTENT_VAR_12345", "l-name")]),
                },
                mkCall("string_length", [{ kind: "ident", id: "i-val", name: "val" }], "c-len"),
            ], { effects: ["reads"] }),
        ]);
        const result = await compileAndRun(mod);
        expect(result.returnValue).toBe(0);
    });
});

// =============================================================================
// args
// =============================================================================

describe("args builtin", () => {
    it("returns a JSON array string", async () => {
        const mod = mkModule([
            mkFn("main", [
                {
                    kind: "let", id: "let-a", name: "a",
                    type: { kind: "basic", name: "String" },
                    value: mkCall("args", []),
                },
                mkCall("print", [{ kind: "ident", id: "i-a", name: "a" }], "c-print"),
                mkLiteral(0, "l-ret"),
            ], { effects: ["reads"] }),
        ]);
        const result = await compileAndRun(mod);
        // Output should be valid JSON
        expect(() => JSON.parse(result.output)).not.toThrow();
        expect(Array.isArray(JSON.parse(result.output))).toBe(true);
    });
});

// =============================================================================
// exit
// =============================================================================

describe("exit builtin", () => {
    it("exit(0) → exitCode 0", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("exit", [mkLiteral(0, "l-code")]),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(0);
    });

    it("exit(1) → exitCode 1", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("exit", [mkLiteral(1, "l-code")]),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(1);
    });

    it("exit(42) → exitCode 42", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("exit", [mkLiteral(42, "l-code")]),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(42);
    });

    it("exit halts execution — code after exit is not reached", async () => {
        const mod = mkModule([
            mkFn("main", [
                mkCall("exit", [mkLiteral(0, "l-code")], "c-exit"),
                // This print should NOT execute
                mkCall("print", [mkLiteral("should-not-print", "l-msg")], "c-print"),
                mkLiteral(99, "l-ret"),
            ]),
        ]);
        const result = await compileAndRun(mod);
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe("");
    });
});
