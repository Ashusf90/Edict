import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compile } from "../../src/codegen/codegen.js";
import { runDirect } from "../../src/codegen/runner.js";
import { check } from "../../src/check.js";
import { NodeHostAdapter } from "../../src/codegen/node-host-adapter.js";
// Using vi to mock fs and child_process is tricky with ESM, but since we are executing WASM, 
// we will just use a temporary directory and an HTTP mock adapter for safe testing.

import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

async function compileAst(ast: unknown): Promise<Uint8Array> {
    const checkResult = await check(ast);
    if (!checkResult.ok || !checkResult.module) {
        throw new Error(`Check failed: ${JSON.stringify(checkResult.errors)}`);
    }
    const compileResult = compile(checkResult.module);
    if (!compileResult.ok) {
        throw new Error(`Compile failed: ${JSON.stringify(compileResult.errors)}`);
    }
    return compileResult.wasm;
}

// Minimal mock adapter to test adapter.fetch behavior without actual network requests
class MockHttpAdapter extends NodeHostAdapter {
    public lastUrl = "";
    override fetch(url: string, method: string, body?: string): { ok: boolean; data: string } {
        this.lastUrl = url;
        return { ok: true, data: "mock payload" };
    }
}

const READ_FILE_AST = {
    kind: "module",
    id: "mod-main",
    name: "main",
    imports: [],
    definitions: [{
        kind: "fn",
        id: "fn-main",
        name: "main",
        params: [],
        effects: ["io"],
        returnType: { kind: "basic", name: "Int" },
        contracts: [],
        body: [{
            kind: "let",
            id: "l-res",
            name: "res",
            type: { kind: "result", ok: { kind: "basic", name: "String" }, err: { kind: "basic", name: "String" } },
            value: {
                kind: "call",
                id: "c-1",
                fn: { kind: "ident", id: "i-read", name: "readFile" },
                args: [{ kind: "ident", id: "i-path", name: "TEST_PATH" }],
            }
        }, {
            kind: "match",
            id: "m-1",
            target: { kind: "ident", id: "i-res2", name: "res" },
            arms: [
                { kind: "arm", id: "a-1", pattern: { kind: "constructor", name: "Ok", fields: [{ kind: "binding", name: "data" }] }, body: [{ kind: "literal", id: "ok-ret", value: 100 }] },
                { kind: "arm", id: "a-2", pattern: { kind: "constructor", name: "Err", fields: [{ kind: "binding", name: "errData" }] }, body: [
                    {
                        kind: "let",
                        id: "l-discard-1",
                        name: "_",
                        type: { kind: "basic", name: "String" },
                        value: {
                            kind: "call",
                            id: "c-print",
                            fn: { kind: "ident", id: "i-print", name: "print" },
                            args: [{ kind: "ident", id: "i-errData2", name: "errData" }],
                        }
                    }, { kind: "literal", id: "err-ret", value: 500 }] }
            ]
        }],
    }],
};

const HTTP_GET_AST = {
    kind: "module",
    id: "mod-main2",
    name: "main",
    imports: [],
    definitions: [{
        kind: "fn",
        id: "fn-main",
        name: "main",
        params: [],
        effects: ["io"],
        returnType: { kind: "basic", name: "Int" },
        contracts: [],
        body: [{
            kind: "let",
            id: "l-res",
            name: "res",
            type: { kind: "result", ok: { kind: "basic", name: "String" }, err: { kind: "basic", name: "String" } },
            value: {
                kind: "call",
                id: "c-1",
                fn: { kind: "ident", id: "i-get", name: "httpGet" },
                args: [{ kind: "ident", id: "i-url", name: "TEST_URL" }],
            }
        }, {
            kind: "match",
            id: "m-1",
            target: { kind: "ident", id: "i-res2", name: "res" },
            arms: [
                { kind: "arm", id: "a-1", pattern: { kind: "constructor", name: "Ok", fields: [{ kind: "binding", name: "data" }] }, body: [{ kind: "literal", id: "ok-ret", value: 100 }] },
                { kind: "arm", id: "a-2", pattern: { kind: "constructor", name: "Err", fields: [{ kind: "binding", name: "errData" }] }, body: [
                    {
                        kind: "let",
                        id: "l-discard-2",
                        name: "_",
                        type: { kind: "basic", name: "String" },
                        value: {
                            kind: "call",
                            id: "c-print",
                            fn: { kind: "ident", id: "i-print", name: "print" },
                            args: [{ kind: "ident", id: "i-errData2", name: "errData" }],
                        }
                    }, { kind: "literal", id: "err-ret", value: 500 }] }
            ]
        }],
    }],
};

function injectParam(ast: any, identName: string, value: string) {
    const cloned = JSON.parse(JSON.stringify(ast));
    const findCallArgs = (node: any) => {
        if (!node) return;
        if (node.kind === "call" && node.args[0] && node.args[0].name === identName) {
            node.args[0] = { kind: "literal", id: "l-injected", value };
        }
        for (const key of Object.keys(node)) {
            if (typeof node[key] === "object") findCallArgs(node[key]);
        }
    };
    findCallArgs(cloned);
    return cloned;
}

describe("Security Sandbox", () => {
    describe("Filesystem chroot (sandboxDir)", () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = mkdtempSync(join(tmpdir(), "edict-test-sandbox-"));
            writeFileSync(join(tempDir, "allowed.txt"), "hello sandbox");
        });

        afterEach(() => {
            rmSync(tempDir, { recursive: true, force: true });
        });

        it("denies access if sandboxDir is totally unset", async () => {
            const wasm = await compileAst(injectParam(READ_FILE_AST, "TEST_PATH", "allowed.txt"));
            const result = await runDirect(wasm, "main", {});

            expect(result.returnValue).toBe(500);
            expect(result.output).toBe("io_not_permitted");
        });

        it("denies access to an absolute path outside sandboxDir", async () => {
            const wasm = await compileAst(injectParam(READ_FILE_AST, "TEST_PATH", "/etc/passwd"));
            const result = await runDirect(wasm, "main", { sandboxDir: tempDir });

            expect(result.returnValue).toBe(500);
            expect(result.output).toBe("io_not_permitted");
        });

        it("denies access to a relative path traversing outside sandboxDir", async () => {
            const wasm = await compileAst(injectParam(READ_FILE_AST, "TEST_PATH", "../outside.txt"));
            const result = await runDirect(wasm, "main", { sandboxDir: tempDir });

            expect(result.returnValue).toBe(500);
            expect(result.output).toBe("io_not_permitted");
        });

        it("allows access to a valid relative path within sandboxDir", async () => {
            const wasm = await compileAst(injectParam(READ_FILE_AST, "TEST_PATH", "allowed.txt"));
            const result = await runDirect(wasm, "main", { sandboxDir: tempDir });

            // 100 is returned from the Ok matching branch
            expect(result.returnValue).toBe(100); 
            expect(result.output).toBe("");
        });
        
        it("allows access to a valid absolute path inside the sandboxDir", async () => {
            const validAbsPath = join(tempDir, "allowed.txt");
            const wasm = await compileAst(injectParam(READ_FILE_AST, "TEST_PATH", validAbsPath));
            const result = await runDirect(wasm, "main", { sandboxDir: tempDir });

            expect(result.returnValue).toBe(100); 
            expect(result.output).toBe("");
        });
    });

    describe("HTTP URL allowlist (allowedHosts)", () => {
        it("allows all hosts when allowedHosts is undefined", async () => {
            const wasm = await compileAst(injectParam(HTTP_GET_AST, "TEST_URL", "https://example.com/api"));
            const adapter = new MockHttpAdapter();
            const result = await runDirect(wasm, "main", { adapter });

            expect(result.returnValue).toBe(100); 
            expect(adapter.lastUrl).toBe("https://example.com/api");
        });

        it("allows hosts that exactly match allowedHosts", async () => {
            const wasm = await compileAst(injectParam(HTTP_GET_AST, "TEST_URL", "https://api.github.com/users"));
            const adapter = new MockHttpAdapter();
            const result = await runDirect(wasm, "main", { 
                adapter, 
                allowedHosts: ["api.github.com", "example.com"] 
            });

            expect(result.returnValue).toBe(100); 
            expect(adapter.lastUrl).toBe("https://api.github.com/users");
        });

        it("denies access to hosts not in allowedHosts", async () => {
            const wasm = await compileAst(injectParam(HTTP_GET_AST, "TEST_URL", "https://malicious.com/steal"));
            const adapter = new MockHttpAdapter();
            const result = await runDirect(wasm, "main", { 
                adapter, 
                allowedHosts: ["api.github.com"] 
            });

            expect(result.returnValue).toBe(500); 
            expect(result.output).toBe("host_not_allowed");
            // Important: Adapter should NOT be called
            expect(adapter.lastUrl).toBe("");
        });

        it("safely denies unparseable garbage URLs", async () => {
            const wasm = await compileAst(injectParam(HTTP_GET_AST, "TEST_URL", "not-a-url at all"));
            const adapter = new MockHttpAdapter();
            const result = await runDirect(wasm, "main", { 
                adapter, 
                allowedHosts: ["api.github.com"] 
            });

            expect(result.returnValue).toBe(500); 
            expect(result.output).toBe("host_not_allowed");
            expect(adapter.lastUrl).toBe("");
        });
    });
});
