// =============================================================================
// Fragment Validation Tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { validate, validateFragmentAst } from "../../src/validator/validate.js";

describe("fragment validation", () => {
    it("accepts a valid fragment", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-001",
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
                            id: "binop-001",
                            op: "+",
                            left: { kind: "ident", id: "id-a-001", name: "a" },
                            right: { kind: "ident", id: "id-b-001", name: "b" },
                        },
                    ],
                },
            ],
        });
        expect(result).toEqual({ ok: true });
    });

    it("accepts a fragment with empty provides and requires", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-002",
            provides: [],
            requires: [],
            imports: [],
            definitions: [],
        });
        expect(result).toEqual({ ok: true });
    });

    it("rejects a fragment missing provides", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-003",
            requires: [],
            imports: [],
            definitions: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.error === "missing_field" && e.field === "provides")).toBe(true);
        }
    });

    it("rejects a fragment missing requires", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-004",
            provides: [],
            imports: [],
            definitions: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.error === "missing_field" && e.field === "requires")).toBe(true);
        }
    });

    it("rejects a fragment missing imports", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-005",
            provides: [],
            requires: [],
            definitions: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.error === "missing_field" && e.field === "imports")).toBe(true);
        }
    });

    it("rejects a fragment missing definitions", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-006",
            provides: [],
            requires: [],
            imports: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.error === "missing_field" && e.field === "definitions")).toBe(true);
        }
    });

    it("rejects a fragment with invalid definition", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-007",
            provides: [],
            requires: [],
            imports: [],
            definitions: [{ kind: "not_a_thing", id: "bad-001" }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.error === "unknown_node_kind")).toBe(true);
        }
    });

    it("rejects a fragment with duplicate IDs", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-008",
            provides: ["f1", "f2"],
            requires: [],
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "fn-dup",
                    name: "f1",
                    params: [],
                    effects: ["pure"],
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-001", value: 1 }],
                },
                {
                    kind: "fn",
                    id: "fn-dup",
                    name: "f2",
                    params: [],
                    effects: ["pure"],
                    contracts: [],
                    body: [{ kind: "literal", id: "lit-002", value: 2 }],
                },
            ],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.error === "duplicate_id")).toBe(true);
        }
    });

    it("rejects non-string elements in provides", () => {
        const result = validate({
            kind: "fragment",
            id: "frag-009",
            provides: [42],
            requires: [],
            imports: [],
            definitions: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.error === "invalid_field_type")).toBe(true);
        }
    });

    it("validateFragmentAst validates fragments explicitly", () => {
        const result = validateFragmentAst({
            kind: "fragment",
            id: "frag-010",
            provides: [],
            requires: [],
            imports: [],
            definitions: [],
        });
        expect(result).toEqual({ ok: true });
    });

    it("auto-detect: module input still validates as module", () => {
        const result = validate({
            kind: "module",
            id: "mod-001",
            name: "test",
            imports: [],
            definitions: [],
        });
        expect(result).toEqual({ ok: true });
    });
});
