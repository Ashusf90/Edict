// =============================================================================
// edict_patch Tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { applyPatches, type AstPatch } from "../../src/patch/apply.js";
import { handlePatch, handleCheck } from "../../src/mcp/handlers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");

function loadExample(name: string): unknown {
    return JSON.parse(
        readFileSync(resolve(projectRoot, "examples", `${name}.edict.json`), "utf-8"),
    );
}

// =============================================================================
// applyPatches — replace
// =============================================================================

describe("applyPatches — replace", () => {
    it("replaces a field on a node by nodeId", () => {
        const ast = loadExample("hello") as Record<string, unknown>;
        // Find the main function's return type and change it
        // hello.edict.json has a main function — let's replace its name
        const result = applyPatches(ast, [
            { nodeId: "fn-main-001", op: "replace", field: "name", value: "renamed" },
        ]);
        expect(result.ok).toBe(true);
        expect(result.ast).toBeDefined();
        // Verify the name was changed
        const mod = result.ast as Record<string, unknown>;
        const defs = mod.definitions as Record<string, unknown>[];
        const main = defs.find(d => (d as any).id === "fn-main-001") as any;
        expect(main.name).toBe("renamed");
    });

    it("does not mutate the original AST", () => {
        const ast = loadExample("hello") as Record<string, unknown>;
        const originalJson = JSON.stringify(ast);
        applyPatches(ast, [
            { nodeId: "fn-main-001", op: "replace", field: "name", value: "renamed" },
        ]);
        expect(JSON.stringify(ast)).toBe(originalJson);
    });

    it("returns patch_invalid_field for non-existent field", () => {
        const ast = loadExample("hello");
        const result = applyPatches(ast, [
            { nodeId: "fn-main-001", op: "replace", field: "nonexistent", value: "x" },
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors[0]!.error).toBe("patch_invalid_field");
    });

    it("returns patch_invalid_field when field is empty string", () => {
        const ast = loadExample("hello");
        const result = applyPatches(ast, [
            { nodeId: "fn-main-001", op: "replace", value: "x" },
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors[0]!.error).toBe("patch_invalid_field");
    });
});

// =============================================================================
// applyPatches — delete
// =============================================================================

describe("applyPatches — delete", () => {
    it("removes a node from its parent array", () => {
        // Use the arithmetic example which has multiple definitions
        const ast = loadExample("arithmetic") as any;
        const defCount = ast.definitions.length;
        // Delete the first definition
        const firstDefId = ast.definitions[0].id;
        const result = applyPatches(ast, [
            { nodeId: firstDefId, op: "delete" },
        ]);
        expect(result.ok).toBe(true);
        const patched = result.ast as any;
        expect(patched.definitions.length).toBe(defCount - 1);
        // Verify the deleted def is gone
        expect(patched.definitions.find((d: any) => d.id === firstDefId)).toBeUndefined();
    });

    it("returns patch_delete_not_in_array for the module node itself", () => {
        const ast = loadExample("hello") as any;
        const result = applyPatches(ast, [
            { nodeId: ast.id, op: "delete" },
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors[0]!.error).toBe("patch_delete_not_in_array");
    });
});

// =============================================================================
// applyPatches — insert
// =============================================================================

describe("applyPatches — insert", () => {
    it("inserts a node into an array field", () => {
        const ast = loadExample("hello") as any;
        const mainFn = ast.definitions.find((d: any) => d.name === "main");
        const bodyLen = mainFn.body.length;

        const newExpr = {
            kind: "literal",
            id: "lit-inserted-001",
            value: 999,
        };

        const result = applyPatches(ast, [
            { nodeId: mainFn.id, op: "insert", field: "body", value: newExpr, index: 0 },
        ]);
        expect(result.ok).toBe(true);
        const patched = result.ast as any;
        const patchedMain = patched.definitions.find((d: any) => d.name === "main");
        expect(patchedMain.body.length).toBe(bodyLen + 1);
        expect(patchedMain.body[0].id).toBe("lit-inserted-001");
    });

    it("inserts at the end when index is omitted", () => {
        const ast = loadExample("hello") as any;
        const mainFn = ast.definitions.find((d: any) => d.name === "main");
        const bodyLen = mainFn.body.length;

        const newExpr = {
            kind: "literal",
            id: "lit-appended-001",
            value: 42,
        };

        const result = applyPatches(ast, [
            { nodeId: mainFn.id, op: "insert", field: "body", value: newExpr },
        ]);
        expect(result.ok).toBe(true);
        const patched = result.ast as any;
        const patchedMain = patched.definitions.find((d: any) => d.name === "main");
        expect(patchedMain.body.length).toBe(bodyLen + 1);
        expect(patchedMain.body[patchedMain.body.length - 1].id).toBe("lit-appended-001");
    });

    it("returns patch_index_out_of_range for invalid index", () => {
        const ast = loadExample("hello") as any;
        const mainFn = ast.definitions.find((d: any) => d.name === "main");

        const result = applyPatches(ast, [
            { nodeId: mainFn.id, op: "insert", field: "body", value: {}, index: 999 },
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors[0]!.error).toBe("patch_index_out_of_range");
    });

    it("returns patch_invalid_field for non-array field", () => {
        const ast = loadExample("hello") as any;
        const mainFn = ast.definitions.find((d: any) => d.name === "main");

        const result = applyPatches(ast, [
            { nodeId: mainFn.id, op: "insert", field: "name", value: "x" },
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors[0]!.error).toBe("patch_invalid_field");
    });
});

// =============================================================================
// applyPatches — node not found
// =============================================================================

describe("applyPatches — error cases", () => {
    it("returns patch_node_not_found for unknown nodeId", () => {
        const ast = loadExample("hello");
        const result = applyPatches(ast, [
            { nodeId: "nonexistent-node-999", op: "replace", field: "name", value: "x" },
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors[0]!.error).toBe("patch_node_not_found");
        expect((result.errors[0] as any).patchIndex).toBe(0);
    });

    it("includes patchIndex in all errors", () => {
        const ast = loadExample("hello");
        const result = applyPatches(ast, [
            { nodeId: "fn-main-001", op: "replace", field: "name", value: "ok" },
            { nodeId: "bad-id", op: "replace", field: "name", value: "x" },
        ]);
        expect(result.ok).toBe(false);
        expect((result.errors[0] as any).patchIndex).toBe(1);
    });
});

// =============================================================================
// applyPatches — multiple patches
// =============================================================================

describe("applyPatches — multiple patches", () => {
    it("applies multiple patches in sequence", () => {
        const ast = loadExample("hello") as any;
        const mainFn = ast.definitions.find((d: any) => d.name === "main");

        // Rename function and add literal to body
        const result = applyPatches(ast, [
            { nodeId: mainFn.id, op: "replace", field: "name", value: "entry" },
            {
                nodeId: mainFn.id, op: "insert", field: "body",
                value: { kind: "literal", id: "lit-multi-001", value: 0 },
            },
        ]);
        expect(result.ok).toBe(true);
        const patched = result.ast as any;
        const patchedMain = patched.definitions.find((d: any) => d.id === mainFn.id);
        expect(patchedMain.name).toBe("entry");
        expect(patchedMain.body.length).toBe(mainFn.body.length + 1);
    });
});

// =============================================================================
// handlePatch — integration
// =============================================================================

describe("handlePatch", () => {
    it("patches and checks a valid AST successfully", async () => {
        const ast = loadExample("hello") as any;
        // A no-op patch: replace name with itself
        const mainFn = ast.definitions.find((d: any) => d.name === "main");
        const result = await handlePatch(ast, [
            { nodeId: mainFn.id, op: "replace", field: "name", value: "main" },
        ]);
        expect(result.ok).toBe(true);
        expect(result.patchedAst).toBeUndefined(); // returnAst defaults to false
    });

    it("includes patchedAst when returnAst is true", async () => {
        const ast = loadExample("hello") as any;
        const mainFn = ast.definitions.find((d: any) => d.name === "main");
        const result = await handlePatch(
            ast,
            [{ nodeId: mainFn.id, op: "replace", field: "name", value: "main" }],
            true,
        );
        expect(result.ok).toBe(true);
        expect(result.patchedAst).toBeDefined();
    });

    it("returns patch errors for bad patches", async () => {
        const ast = loadExample("hello");
        const result = await handlePatch(ast, [
            { nodeId: "nonexistent", op: "replace", field: "x", value: "y" },
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors![0]!.error).toBe("patch_node_not_found");
    });

    it("returns check errors when patch produces invalid AST", async () => {
        const ast = loadExample("hello") as any;
        const mainFn = ast.definitions.find((d: any) => d.name === "main");
        // Change return type to Bool — body returns Int, so this will cause a type mismatch
        const result = await handlePatch(ast, [
            {
                nodeId: mainFn.id,
                op: "replace",
                field: "returnType",
                value: { kind: "basic", name: "Bool" },
            },
        ]);
        // The check should fail because the body returns Int, not Bool
        expect(result.ok).toBe(false);
        expect(result.errors).toBeDefined();
    });
});

// =============================================================================
// fix_suggestions round-trip
// =============================================================================

describe("fix_suggestions round-trip", () => {
    it("broken AST → error with suggestion → patch → fixed", async () => {
        // Create a program with a misspelled identifier
        const brokenAst = {
            kind: "module",
            id: "mod-001",
            name: "test",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-add-001",
                    name: "add",
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
                            id: "binop-001",
                            op: "+",
                            left: { kind: "ident", id: "id-x-001", name: "x" },
                            right: { kind: "ident", id: "id-y-001", name: "yy" }, // misspelled: yy instead of y
                        },
                    ],
                },
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
                            id: "call-001",
                            fn: { kind: "ident", id: "id-add-001", name: "add" },
                            args: [
                                { kind: "literal", id: "lit-1-001", value: 1 },
                                { kind: "literal", id: "lit-2-001", value: 2 },
                            ],
                        },
                    ],
                },
            ],
        };

        // Step 1: Check the broken AST — expect an error with a suggestion
        const checkResult = await handleCheck(brokenAst);
        expect(checkResult.ok).toBe(false);
        const undefinedErr = checkResult.errors?.find(
            (e) => e.error === "undefined_reference" && (e as any).name === "yy",
        );
        expect(undefinedErr).toBeDefined();

        // The suggestion should point us to "y"
        const suggestion = (undefinedErr as any).suggestion;
        expect(suggestion).toBeDefined();
        expect(suggestion.value).toBe("y");

        // Step 2: Convert FixSuggestion to AstPatch and apply
        const patch: AstPatch = {
            nodeId: suggestion.nodeId,
            op: "replace",
            field: suggestion.field,
            value: suggestion.value,
        };

        const patchResult = await handlePatch(brokenAst, [patch]);
        expect(patchResult.ok).toBe(true);
    });
});
