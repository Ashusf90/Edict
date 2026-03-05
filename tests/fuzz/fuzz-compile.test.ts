import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { check } from "../../src/check.js";
import { compile } from "../../src/codegen/codegen.js";
import type { EdictModule } from "../../src/ast/nodes.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// Fuzz tests for compile() — programs that pass check() must compile
// =============================================================================
// Property: if check(ast).ok === true, then compile(module) must not throw
// and must return a CompileResult.

// Load all example programs that don't use imports (can't resolve cross-module)
const examplesDir = join(import.meta.dirname, "../../examples");
const exampleFiles = readdirSync(examplesDir)
    .filter((f) => f.endsWith(".edict.json"))
    .filter((f) => f !== "modules.edict.json"); // cross-module, skip

const exampleASTs: { name: string; ast: unknown }[] = exampleFiles.map((f) => ({
    name: f,
    ast: JSON.parse(readFileSync(join(examplesDir, f), "utf-8")),
}));

describe("fuzz — compile()", () => {
    // =========================================================================
    // Property 1: All example programs that pass check() compile without crash
    // =========================================================================
    it("compiles all valid example programs without throwing", async () => {
        for (const { name, ast } of exampleASTs) {
            const checkResult = await check(ast);
            if (checkResult.ok && checkResult.module) {
                const compileResult = compile(checkResult.module);
                expect(compileResult).toBeDefined();
                expect(typeof compileResult.ok).toBe("boolean");
                if (!compileResult.ok) {
                    // Compile errors are acceptable, crashes are not
                    expect(Array.isArray(compileResult.errors)).toBe(true);
                }
            }
            // Programs that fail check() are skipped — they may have unresolved imports
        }
    }, 60_000); // generous timeout for Z3

    // =========================================================================
    // Property 2: Valid programs with varied literal values compile
    // =========================================================================
    it("compiles programs with random literal values without throwing", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.oneof(
                    fc.integer({ min: -1_000_000, max: 1_000_000 }),
                    fc.integer({ min: 0, max: 0 }),
                    fc.integer({ min: 2_147_483_647, max: 2_147_483_647 }), // i32 max
                    fc.integer({ min: -2_147_483_648, max: -2_147_483_648 }), // i32 min
                ),
                async (value) => {
                    const ast = {
                        kind: "module",
                        id: "fuzz-compile-mod",
                        name: "test",
                        imports: [],
                        definitions: [
                            {
                                kind: "fn",
                                id: "fuzz-compile-fn",
                                name: "main",
                                params: [],
                                effects: ["pure"],
                                returnType: { kind: "basic", name: "Int" },
                                contracts: [],
                                body: [
                                    { kind: "literal", id: "fuzz-compile-lit", value },
                                ],
                            },
                        ],
                    };

                    const checkResult = await check(ast);
                    if (checkResult.ok && checkResult.module) {
                        const compileResult = compile(checkResult.module);
                        expect(compileResult).toBeDefined();
                        expect(typeof compileResult.ok).toBe("boolean");
                    }
                },
            ),
            { numRuns: 200 },
        );
    }, 60_000);

    // =========================================================================
    // Property 3: Valid programs with varied string literals compile
    // =========================================================================
    it("compiles programs with random string literal values without throwing", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 0, maxLength: 500 }),
                async (value) => {
                    const ast = {
                        kind: "module",
                        id: "fuzz-compile-mod",
                        name: "test",
                        imports: [],
                        definitions: [
                            {
                                kind: "fn",
                                id: "fuzz-compile-fn",
                                name: "main",
                                params: [],
                                effects: ["io"],
                                returnType: { kind: "basic", name: "Int" },
                                contracts: [],
                                body: [
                                    {
                                        kind: "call",
                                        id: "fuzz-compile-call",
                                        fn: { kind: "ident", id: "fuzz-compile-ident", name: "print" },
                                        args: [
                                            { kind: "literal", id: "fuzz-compile-lit", value },
                                        ],
                                    },
                                    { kind: "literal", id: "fuzz-compile-ret", value: 0 },
                                ],
                            },
                        ],
                    };

                    const checkResult = await check(ast);
                    if (checkResult.ok && checkResult.module) {
                        const compileResult = compile(checkResult.module);
                        expect(compileResult).toBeDefined();
                        expect(typeof compileResult.ok).toBe("boolean");
                    }
                },
            ),
            { numRuns: 200 },
        );
    }, 60_000);
});
