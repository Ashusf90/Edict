// =============================================================================
// Fragment Composition Tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { compose } from "../../src/compose/compose.js";
import { check } from "../../src/check.js";
import type { EdictFragment } from "../../src/ast/nodes.js";

// =============================================================================
// Helper fragments
// =============================================================================

const addFragment: EdictFragment = {
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

const mainFragment: EdictFragment = {
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

const pointFragment: EdictFragment = {
    kind: "fragment",
    id: "frag-point-001",
    provides: ["Point"],
    requires: [],
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

// =============================================================================
// Tests
// =============================================================================

describe("compose", () => {
    it("composes two complementary fragments into a valid module", () => {
        const result = compose([addFragment, mainFragment], "test", "mod-001");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.module.kind).toBe("module");
            expect(result.module.name).toBe("test");
            expect(result.module.id).toBe("mod-001");
            expect(result.module.definitions).toHaveLength(2);
        }
    });

    it("empty fragments array produces a valid empty module", () => {
        const result = compose([], "empty", "mod-empty-001");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.module.definitions).toHaveLength(0);
            expect(result.module.imports).toHaveLength(0);
        }
    });

    it("errors on unsatisfied requirement", () => {
        const result = compose([mainFragment], "test", "mod-001");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].error).toBe("unsatisfied_requirement");
            if (result.errors[0].error === "unsatisfied_requirement") {
                expect(result.errors[0].requirement).toBe("add");
                expect(result.errors[0].fragmentId).toBe("frag-main-001");
            }
        }
    });

    it("errors on duplicate provision", () => {
        const dup: EdictFragment = {
            kind: "fragment",
            id: "frag-dup-001",
            provides: ["add"],
            requires: [],
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-add-dup-001",
                    name: "add",
                    params: [],
                    effects: ["pure"],
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-dup-001", value: 0 }],
                },
            ],
        };

        const result = compose([addFragment, dup], "test", "mod-001");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors[0].error).toBe("duplicate_provision");
            if (result.errors[0].error === "duplicate_provision") {
                expect(result.errors[0].name).toBe("add");
                expect(result.errors[0].fragmentIds).toContain("frag-add-001");
                expect(result.errors[0].fragmentIds).toContain("frag-dup-001");
            }
        }
    });

    it("three fragments compose correctly", () => {
        const result = compose([addFragment, pointFragment, mainFragment], "full", "mod-full-001");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.module.definitions).toHaveLength(3);
        }
    });

    it("composed module passes full check pipeline", async () => {
        const result = compose([addFragment, mainFragment], "test", "mod-check-001");
        expect(result.ok).toBe(true);
        if (result.ok) {
            const checkResult = await check(result.module);
            expect(checkResult.ok).toBe(true);
        }
    });

    it("deduplicates imports across fragments", () => {
        const fragA: EdictFragment = {
            kind: "fragment",
            id: "frag-a-001",
            provides: ["fa"],
            requires: [],
            imports: [{ kind: "import", id: "imp-a-001", module: "std", names: ["map", "filter"] }],
            definitions: [
                {
                    kind: "fn", id: "fn-fa-001", name: "fa",
                    params: [], effects: ["pure"], contracts: [],
                    body: [{ kind: "literal", id: "lit-a-001", value: 1 }],
                },
            ],
        };

        const fragB: EdictFragment = {
            kind: "fragment",
            id: "frag-b-001",
            provides: ["fb"],
            requires: [],
            imports: [{ kind: "import", id: "imp-b-001", module: "std", names: ["map", "reduce"] }],
            definitions: [
                {
                    kind: "fn", id: "fn-fb-001", name: "fb",
                    params: [], effects: ["pure"], contracts: [],
                    body: [{ kind: "literal", id: "lit-b-001", value: 2 }],
                },
            ],
        };

        const result = compose([fragA, fragB], "dedup", "mod-dedup-001");
        expect(result.ok).toBe(true);
        if (result.ok) {
            // Should have 1 import entry for "std" with 3 unique names: map, filter, reduce
            expect(result.module.imports).toHaveLength(1);
            expect(result.module.imports[0].module).toBe("std");
            expect(result.module.imports[0].names).toContain("map");
            expect(result.module.imports[0].names).toContain("filter");
            expect(result.module.imports[0].names).toContain("reduce");
            // "map" should not be duplicated
            expect(result.module.imports[0].names.filter((n) => n === "map")).toHaveLength(1);
        }
    });

    it("rejects invalid fragment in composition", () => {
        // Missing required fields
        const badFrag = {
            kind: "fragment",
            id: "frag-bad-001",
        } as unknown as EdictFragment;

        const result = compose([badFrag], "test", "mod-001");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.length).toBeGreaterThan(0);
        }
    });

    it("uses default module name and id when not specified", () => {
        const result = compose([addFragment]);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.module.name).toBe("composed");
            expect(result.module.id).toBe("mod-composed-001");
        }
    });
});
