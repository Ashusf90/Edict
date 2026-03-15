// =============================================================================
// Miniflare Integration Test — edge deployment pipeline end-to-end
// =============================================================================
// Validates the full pipeline: Edict AST → compile → scaffold → miniflare → HTTP response.
// Issue: https://github.com/Sowiedu/Edict/issues/160

import { describe, it, expect, afterAll } from "vitest";
import { Miniflare } from "miniflare";

import { check } from "../../src/check.js";
import { compile } from "../../src/codegen/codegen.js";
import { generateWorkerScaffold } from "../../src/deploy/scaffold.js";

// ---------------------------------------------------------------------------
// Fixture: Edict program that prints "Hello from Edict!" and returns 42
// ---------------------------------------------------------------------------

const EDICT_PROGRAM = {
    kind: "module",
    id: "mod-miniflare-test",
    name: "miniflare-test",
    schemaVersion: "1.1",
    imports: [],
    definitions: [
        {
            kind: "fn",
            id: "fn-main",
            name: "main",
            params: [],
            effects: ["io"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "call",
                    id: "call-print",
                    fn: { kind: "ident", id: "id-print", name: "print" },
                    args: [
                        {
                            kind: "literal",
                            id: "lit-msg",
                            value: "Hello from Edict!",
                        },
                    ],
                },
                { kind: "literal", id: "lit-42", value: 42 },
            ],
        },
    ],
};

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("Miniflare integration: edge deployment pipeline", { timeout: 30_000 }, () => {
    let mf: Miniflare;

    afterAll(async () => {
        if (mf) await mf.dispose();
    });

    it("compiles Edict AST → scaffold → miniflare → HTTP 200 with correct output", async () => {
        // ── Step 1: Full pipeline — check → compile → scaffold ────────
        const checkResult = await check(EDICT_PROGRAM);
        expect(checkResult.ok).toBe(true);

        const compileResult = compile(checkResult.module!, {
            typeInfo: checkResult.typeInfo,
        });
        expect(compileResult.ok).toBe(true);

        const scaffoldResult = generateWorkerScaffold(compileResult.wasm!, {
            name: "miniflare-test",
        });
        expect(scaffoldResult.ok).toBe(true);

        // ── Step 2: Extract bundle files ──────────────────────────────
        const workerFile = scaffoldResult.bundle!.files.find(f => f.path === "worker.js")!;
        const wasmFile = scaffoldResult.bundle!.files.find(f => f.path === "program.wasm")!;

        const workerScript = typeof workerFile.content === "string"
            ? workerFile.content
            : new TextDecoder().decode(workerFile.content);
        const wasmBytes = wasmFile.content instanceof Uint8Array
            ? wasmFile.content
            : new TextEncoder().encode(wasmFile.content);

        // ── Step 3: Start Miniflare with inline modules ───────────────
        // Uses the modules-array API — provides worker.js and program.wasm
        // directly in memory. No temp directory needed.
        mf = new Miniflare({
            modules: [
                { type: "ESModule", path: "worker.js", contents: workerScript },
                { type: "CompiledWasm", path: "./program.wasm", contents: wasmBytes },
            ],
            compatibilityDate: "2024-01-01",
        });

        // ── Step 4: Dispatch HTTP request and validate response ───────
        const response = await mf.dispatchFetch("http://localhost/");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/plain");

        const body = await response.text();
        expect(body).toContain("Hello from Edict!");
    });
});
