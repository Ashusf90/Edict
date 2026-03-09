// =============================================================================
// Multi-Module Compilation Tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { checkMultiModule } from "../../src/multi-module.js";
import { compile } from "../../src/codegen/codegen.js";
import { run } from "../../src/codegen/runner.js";
import type { EdictModule } from "../../src/ast/nodes.js";

// =============================================================================
// Helper modules
// =============================================================================

const mathModule: EdictModule = {
    kind: "module",
    id: "mod-math-001",
    name: "math",
    imports: [],
    definitions: [
        {
            kind: "fn",
            id: "fn-add-001",
            name: "add",
            params: [
                { kind: "param", id: "p-a-001", name: "a", type: { kind: "basic", name: "Int" } },
                { kind: "param", id: "p-b-001", name: "b", type: { kind: "basic", name: "Int" } },
            ],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "binop",
                    id: "binop-add-001",
                    op: "+",
                    left: { kind: "ident", id: "id-a-001", name: "a" },
                    right: { kind: "ident", id: "id-b-001", name: "b" },
                },
            ],
        },
        {
            kind: "fn",
            id: "fn-multiply-001",
            name: "multiply",
            params: [
                { kind: "param", id: "p-x-001", name: "x", type: { kind: "basic", name: "Int" } },
                { kind: "param", id: "p-y-001", name: "y", type: { kind: "basic", name: "Int" } },
            ],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "binop",
                    id: "binop-mul-001",
                    op: "*",
                    left: { kind: "ident", id: "id-x-001", name: "x" },
                    right: { kind: "ident", id: "id-y-001", name: "y" },
                },
            ],
        },
    ],
};

const mainModule: EdictModule = {
    kind: "module",
    id: "mod-main-001",
    name: "main",
    imports: [
        { kind: "import", id: "imp-math-001", module: "math", names: ["add"] },
    ],
    definitions: [
        {
            kind: "fn",
            id: "fn-main-001",
            name: "main",
            params: [],
            effects: ["io"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "call",
                    id: "call-add-001",
                    fn: { kind: "ident", id: "id-add-001", name: "add" },
                    args: [
                        { kind: "literal", id: "lit-2-001", value: 2 },
                        { kind: "literal", id: "lit-3-001", value: 3 },
                    ],
                },
            ],
        },
    ],
};

// =============================================================================
// Tests
// =============================================================================

describe("checkMultiModule", () => {
    it("two-module program compiles and runs", async () => {
        const result = await checkMultiModule([mathModule, mainModule]);
        expect(result.ok).toBe(true);
        expect(result.mergedModule).toBeDefined();
        expect(result.moduleOrder).toBeDefined();

        // Compile and run the merged module
        const compileResult = compile(result.mergedModule!, { typeInfo: result.typeInfo });
        expect(compileResult.ok).toBe(true);
        if (compileResult.ok) {
            const runResult = await run(compileResult.wasm);
            expect(runResult.exitCode).toBe(0);
            // add(2, 3) should return 5
            expect(runResult.returnValue).toBe(5);
        }
    });

    it("three-module chain works", async () => {
        const moduleC: EdictModule = {
            kind: "module",
            id: "mod-c-001",
            name: "base",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-identity-001",
                    name: "identity",
                    params: [
                        { kind: "param", id: "p-n-001", name: "n", type: { kind: "basic", name: "Int" } },
                    ],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{ kind: "ident", id: "id-n-001", name: "n" }],
                },
            ],
        };

        const moduleB: EdictModule = {
            kind: "module",
            id: "mod-b-001",
            name: "middle",
            imports: [
                { kind: "import", id: "imp-base-001", module: "base", names: ["identity"] },
            ],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-double-001",
                    name: "double",
                    params: [
                        { kind: "param", id: "p-v-001", name: "v", type: { kind: "basic", name: "Int" } },
                    ],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [
                        {
                            kind: "binop",
                            id: "binop-mul-002",
                            op: "*",
                            left: {
                                kind: "call",
                                id: "call-id-001",
                                fn: { kind: "ident", id: "id-identity-001", name: "identity" },
                                args: [{ kind: "ident", id: "id-v-001", name: "v" }],
                            },
                            right: { kind: "literal", id: "lit-2-002", value: 2 },
                        },
                    ],
                },
            ],
        };

        const moduleA: EdictModule = {
            kind: "module",
            id: "mod-a-001",
            name: "top",
            imports: [
                { kind: "import", id: "imp-mid-001", module: "middle", names: ["double"] },
            ],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-main-002",
                    name: "main",
                    params: [],
                    effects: ["io"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [
                        {
                            kind: "call",
                            id: "call-double-001",
                            fn: { kind: "ident", id: "id-double-001", name: "double" },
                            args: [{ kind: "literal", id: "lit-5-001", value: 5 }],
                        },
                    ],
                },
            ],
        };

        const result = await checkMultiModule([moduleA, moduleB, moduleC]);
        expect(result.ok).toBe(true);
        expect(result.moduleOrder).toContain("base");
        expect(result.moduleOrder).toContain("middle");
        expect(result.moduleOrder).toContain("top");

        // Verify order: base before middle, middle before top
        const order = result.moduleOrder!;
        expect(order.indexOf("base")).toBeLessThan(order.indexOf("middle"));
        expect(order.indexOf("middle")).toBeLessThan(order.indexOf("top"));

        // Compile and run
        const compileResult = compile(result.mergedModule!, { typeInfo: result.typeInfo });
        expect(compileResult.ok).toBe(true);
        if (compileResult.ok) {
            const runResult = await run(compileResult.wasm);
            expect(runResult.exitCode).toBe(0);
            // double(5) = identity(5) * 2 = 10
            expect(runResult.returnValue).toBe(10);
        }
    });

    it("cross-module type references work", async () => {
        const typesModule: EdictModule = {
            kind: "module",
            id: "mod-types-001",
            name: "types",
            imports: [],
            definitions: [
                {
                    kind: "record",
                    id: "rec-point-001",
                    name: "Point",
                    fields: [
                        { kind: "field", id: "f-x-001", name: "x", type: { kind: "basic", name: "Int" } },
                        { kind: "field", id: "f-y-001", name: "y", type: { kind: "basic", name: "Int" } },
                    ],
                },
            ],
        };

        const useModule: EdictModule = {
            kind: "module",
            id: "mod-use-001",
            name: "use_types",
            imports: [
                { kind: "import", id: "imp-types-001", module: "types", names: ["Point"] },
            ],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-origin-001",
                    name: "main",
                    params: [],
                    effects: ["io"],
                    returnType: { kind: "named", name: "Point" },
                    contracts: [],
                    body: [
                        {
                            kind: "record_expr",
                            id: "re-001",
                            name: "Point",
                            fields: [
                                { kind: "field_init", name: "x", value: { kind: "literal", id: "lit-0-001", value: 0 } },
                                { kind: "field_init", name: "y", value: { kind: "literal", id: "lit-0-002", value: 0 } },
                            ],
                        },
                    ],
                },
            ],
        };

        const result = await checkMultiModule([typesModule, useModule]);
        expect(result.ok).toBe(true);
        expect(result.mergedModule).toBeDefined();
    });

    it("detects circular imports", async () => {
        const modA: EdictModule = {
            kind: "module",
            id: "mod-cycle-a-001",
            name: "alpha",
            imports: [
                { kind: "import", id: "imp-beta-001", module: "beta", names: ["fb"] },
            ],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-fa-001",
                    name: "fa",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-fa-001", value: 1 }],
                },
            ],
        };

        const modB: EdictModule = {
            kind: "module",
            id: "mod-cycle-b-001",
            name: "beta",
            imports: [
                { kind: "import", id: "imp-alpha-001", module: "alpha", names: ["fa"] },
            ],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-fb-001",
                    name: "fb",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-fb-001", value: 2 }],
                },
            ],
        };

        const result = await checkMultiModule([modA, modB]);
        expect(result.ok).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toBe("circular_import");
        if (result.errors[0].error === "circular_import") {
            expect(result.errors[0].cycle).toContain("alpha");
            expect(result.errors[0].cycle).toContain("beta");
        }
    });

    it("detects unresolved module", async () => {
        const mod: EdictModule = {
            kind: "module",
            id: "mod-bad-001",
            name: "lonely",
            imports: [
                { kind: "import", id: "imp-ghost-001", module: "nonexistent", names: ["foo"] },
            ],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-lonely-001",
                    name: "main",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-lonely-001", value: 0 }],
                },
            ],
        };

        const result = await checkMultiModule([mod]);
        expect(result.ok).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toBe("unresolved_module");
        if (result.errors[0].error === "unresolved_module") {
            expect(result.errors[0].moduleName).toBe("nonexistent");
            expect(result.errors[0].importNodeId).toBe("imp-ghost-001");
            expect(result.errors[0].available).toContain("lonely");
        }
    });

    it("detects duplicate module names", async () => {
        const mod1: EdictModule = {
            kind: "module",
            id: "mod-dup-001",
            name: "math",
            imports: [],
            definitions: [],
        };

        const mod2: EdictModule = {
            kind: "module",
            id: "mod-dup-002",
            name: "math",
            imports: [],
            definitions: [],
        };

        const result = await checkMultiModule([mod1, mod2]);
        expect(result.ok).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toBe("duplicate_module_name");
        if (result.errors[0].error === "duplicate_module_name") {
            expect(result.errors[0].moduleName).toBe("math");
            expect(result.errors[0].moduleIds).toContain("mod-dup-001");
            expect(result.errors[0].moduleIds).toContain("mod-dup-002");
        }
    });

    it("preserves external std imports after merge", async () => {
        const modWithStd: EdictModule = {
            kind: "module",
            id: "mod-std-001",
            name: "math",
            imports: [
                { kind: "import", id: "imp-std-001", module: "std", names: ["map"] },
            ],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-math-001",
                    name: "compute",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-std-001", value: 42 }],
                },
            ],
        };

        const mainMod: EdictModule = {
            kind: "module",
            id: "mod-main-std-001",
            name: "main",
            imports: [
                { kind: "import", id: "imp-math-std-001", module: "math", names: ["compute"] },
            ],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-main-std-001",
                    name: "main",
                    params: [],
                    effects: ["io"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [
                        {
                            kind: "call",
                            id: "call-compute-001",
                            fn: { kind: "ident", id: "id-compute-001", name: "compute" },
                            args: [],
                        },
                    ],
                },
            ],
        };

        const result = await checkMultiModule([modWithStd, mainMod]);
        expect(result.ok).toBe(true);
        // Merged module should still have the std import
        expect(result.mergedModule!.imports).toHaveLength(1);
        expect(result.mergedModule!.imports[0].module).toBe("std");
        expect(result.mergedModule!.imports[0].names).toContain("map");
    });

    it("single-module backwards compatibility", async () => {
        // A single module with no imports should work fine
        const singleModule: EdictModule = {
            kind: "module",
            id: "mod-single-001",
            name: "single",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-single-001",
                    name: "main",
                    params: [],
                    effects: ["io"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-single-001", value: 99 }],
                },
            ],
        };

        const result = await checkMultiModule([singleModule]);
        expect(result.ok).toBe(true);
        expect(result.mergedModule).toBeDefined();
        expect(result.moduleOrder).toEqual(["single"]);

        // Compile and run
        const compileResult = compile(result.mergedModule!, { typeInfo: result.typeInfo });
        expect(compileResult.ok).toBe(true);
        if (compileResult.ok) {
            const runResult = await run(compileResult.wasm);
            expect(runResult.exitCode).toBe(0);
            expect(runResult.returnValue).toBe(99);
        }
    });
});
