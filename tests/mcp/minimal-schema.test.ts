// =============================================================================
// Minimal Schema Tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { handleSchema } from "../../src/mcp/handlers.js";
import { stripDescriptions } from "../../src/mcp/minimal-schema.js";

describe("stripDescriptions", () => {
    it("removes top-level description", () => {
        const input = { type: "object", description: "A module", properties: {} };
        const result = stripDescriptions(input) as Record<string, unknown>;
        expect(result.type).toBe("object");
        expect(result.description).toBeUndefined();
        expect(result.properties).toBeDefined();
    });

    it("removes nested descriptions", () => {
        const input = {
            type: "object",
            description: "Top",
            properties: {
                name: { type: "string", description: "Name field" },
            },
        };
        const result = stripDescriptions(input) as any;
        expect(result.description).toBeUndefined();
        expect(result.properties.name.description).toBeUndefined();
        expect(result.properties.name.type).toBe("string");
    });

    it("handles arrays", () => {
        const input = [
            { type: "string", description: "First" },
            { type: "number", description: "Second" },
        ];
        const result = stripDescriptions(input) as any[];
        expect(result[0].description).toBeUndefined();
        expect(result[1].description).toBeUndefined();
        expect(result[0].type).toBe("string");
    });

    it("preserves non-description fields", () => {
        const input = { type: "object", required: ["a", "b"], enum: [1, 2, 3] };
        const result = stripDescriptions(input) as any;
        expect(result.type).toBe("object");
        expect(result.required).toEqual(["a", "b"]);
        expect(result.enum).toEqual([1, 2, 3]);
    });

    it("handles null and primitive values", () => {
        expect(stripDescriptions(null)).toBeNull();
        expect(stripDescriptions(undefined)).toBeUndefined();
        expect(stripDescriptions("hello")).toBe("hello");
        expect(stripDescriptions(42)).toBe(42);
        expect(stripDescriptions(true)).toBe(true);
    });

    it("does not mutate the input", () => {
        const input = { type: "object", description: "Keep me" };
        stripDescriptions(input);
        expect(input.description).toBe("Keep me");
    });

    it("strips redundant type when const is present", () => {
        const input = { type: "string", const: "fn" };
        const result = stripDescriptions(input) as any;
        expect(result.type).toBeUndefined();
        expect(result.const).toBe("fn");
    });

    it("preserves type when no const is present", () => {
        const input = { type: "string", name: "foo" };
        const result = stripDescriptions(input) as any;
        expect(result.type).toBe("string");
    });
});

describe("handleSchema with format", () => {
    it("defaults to full format", () => {
        const result = handleSchema();
        expect(result.format).toBe("full");
        expect(result.tokenEstimate).toBeGreaterThan(0);
    });

    it("full format includes descriptions", () => {
        const result = handleSchema("full");
        const text = JSON.stringify(result.schema);
        expect(text).toContain("description");
        expect(result.format).toBe("full");
    });

    it("minimal format strips descriptions", () => {
        const result = handleSchema("minimal");
        const text = JSON.stringify(result.schema);
        expect(text).not.toContain("description");
        expect(result.format).toBe("minimal");
    });

    it("minimal schema is smaller than full schema", () => {
        const full = handleSchema("full");
        const minimal = handleSchema("minimal");

        const fullSize = JSON.stringify(full.schema).length;
        const minimalSize = JSON.stringify(minimal.schema).length;

        expect(minimalSize).toBeLessThan(fullSize);
        expect(minimal.tokenEstimate).toBeLessThan(full.tokenEstimate);
    });

    it("both formats validate same structure (same $ref, same required)", () => {
        const full = handleSchema("full");
        const minimal = handleSchema("minimal");

        const fullKeys = Object.keys((full.schema as any).definitions || {}).sort();
        const minimalKeys = Object.keys((minimal.schema as any).definitions || {}).sort();

        expect(minimalKeys).toEqual(fullKeys);
    });

    it("both formats have same required fields", () => {
        const full = handleSchema("full");
        const minimal = handleSchema("minimal");

        expect((minimal.schema as any).required).toEqual((full.schema as any).required);
    });

    it("token estimate is roughly bytes/4", () => {
        const result = handleSchema("full");
        const actualBytes = JSON.stringify(result.schema).length;
        expect(result.tokenEstimate).toBe(Math.ceil(actualBytes / 4));
    });
});
