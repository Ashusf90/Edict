// =============================================================================
// Compose MCP Handler Tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { handleCompose, handleValidate } from "../../src/mcp/handlers.js";

describe("handleCompose", () => {
    const addFragment = {
        kind: "fragment",
        id: "frag-add-001",
        provides: ["add"],
        requires: [],
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
        ],
    };

    const mainFragment = {
        kind: "fragment",
        id: "frag-main-001",
        provides: ["main"],
        requires: ["add"],
        imports: [],
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
                            { kind: "literal", id: "lit-1-001", value: 1 },
                            { kind: "literal", id: "lit-2-001", value: 2 },
                        ],
                    },
                ],
            },
        ],
    };

    it("composes valid fragments into a module", async () => {
        const result = await handleCompose([addFragment, mainFragment]);
        expect(result.ok).toBe(true);
        expect(result.module).toBeDefined();
        const module = result.module as Record<string, unknown>;
        expect(module["kind"]).toBe("module");
    });

    it("with check=true runs full pipeline", async () => {
        const result = await handleCompose([addFragment, mainFragment], "test", "mod-001", true);
        expect(result.ok).toBe(true);
        expect(result.module).toBeDefined();
    });

    it("returns errors for unsatisfied requirements", async () => {
        const result = await handleCompose([mainFragment]);
        expect(result.ok).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.some((e) => e.error === "unsatisfied_requirement")).toBe(true);
    });

    it("returns errors for duplicate provisions", async () => {
        const duplicateAdd = {
            ...addFragment,
            id: "frag-dup-001",
            definitions: [
                {
                    kind: "fn",
                    id: "fn-add-dup-001",
                    name: "add_dup",
                    params: [],
                    effects: ["pure"],
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-dup-001", value: 0 }],
                },
            ],
        };

        const result = await handleCompose([addFragment, duplicateAdd]);
        expect(result.ok).toBe(false);
        expect(result.errors!.some((e) => e.error === "duplicate_provision")).toBe(true);
    });
});

describe("handleValidate with fragments", () => {
    it("validates a fragment input correctly", () => {
        const result = handleValidate({
            kind: "fragment",
            id: "frag-001",
            provides: ["test"],
            requires: [],
            imports: [],
            definitions: [],
        });
        expect(result.ok).toBe(true);
    });

    it("rejects invalid fragment", () => {
        const result = handleValidate({
            kind: "fragment",
            id: "frag-001",
            // missing provides, requires, imports, definitions
        });
        expect(result.ok).toBe(false);
        expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("still validates modules correctly", () => {
        const result = handleValidate({
            kind: "module",
            id: "mod-001",
            name: "test",
            imports: [],
            definitions: [],
        });
        expect(result.ok).toBe(true);
    });
});
