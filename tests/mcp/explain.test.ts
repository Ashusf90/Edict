// =============================================================================
// edict_explain Tests — structured repair context from the error catalog
// =============================================================================

import { describe, it, expect } from "vitest";
import { explainError } from "../../src/errors/explain.js";
import { buildErrorCatalog } from "../../src/errors/error-catalog.js";
import { explainTool } from "../../src/mcp/tools/explain.js";
import type { ExplainResultFound } from "../../src/errors/explain.js";

// =============================================================================
// Core explainError function
// =============================================================================

describe("explainError", () => {
    const catalog = buildErrorCatalog();

    it("returns found=true for every catalog error type", () => {
        for (const entry of catalog.errors) {
            const result = explainError({ error: entry.type });
            expect(result.found, `expected found=true for ${entry.type}`).toBe(true);
            if (result.found) {
                expect(result.errorType).toBe(entry.type);
                expect(result.pipelineStage).toBe(entry.pipeline_stage);
                expect(result.fields).toEqual(entry.fields);
                expect(result.exampleCause).toEqual(entry.example_cause);
                expect(result.exampleFix).toEqual(entry.example_fix);
            }
        }
    });

    it("returns found=false with reason unknown_error_type for fabricated types", () => {
        const result = explainError({ error: "nonexistent_error_xyz" });
        expect(result.found).toBe(false);
        if (!result.found) {
            expect(result.reason).toBe("unknown_error_type");
            expect(result.errorType).toBe("nonexistent_error_xyz");
        }
    });

    it("returns found=false with reason missing_discriminator when no error field", () => {
        const result = explainError({});
        expect(result.found).toBe(false);
        if (!result.found) {
            expect(result.reason).toBe("missing_discriminator");
        }
    });

    it("returns found=false for non-string error field", () => {
        const result = explainError({ error: 42 });
        expect(result.found).toBe(false);
        if (!result.found) {
            expect(result.reason).toBe("missing_discriminator");
        }
    });

    it("returns found=false for null input", () => {
        const result = explainError(null as any);
        expect(result.found).toBe(false);
    });

    it("produces non-empty repairStrategy for type_mismatch", () => {
        const result = explainError({ error: "type_mismatch" });
        expect(result.found).toBe(true);
        const r = result as ExplainResultFound;
        expect(r.repairStrategy.length).toBeGreaterThan(0);
    });

    it("produces non-empty repairStrategy for undefined_reference", () => {
        const result = explainError({ error: "undefined_reference" });
        expect(result.found).toBe(true);
        const r = result as ExplainResultFound;
        expect(r.repairStrategy.length).toBeGreaterThan(0);
    });

    it("produces non-empty repairStrategy for effect_violation", () => {
        const result = explainError({ error: "effect_violation" });
        expect(result.found).toBe(true);
        const r = result as ExplainResultFound;
        expect(r.repairStrategy.length).toBeGreaterThan(0);
    });

    it("produces non-empty repairStrategy for contract_failure", () => {
        const result = explainError({ error: "contract_failure" });
        expect(result.found).toBe(true);
        const r = result as ExplainResultFound;
        expect(r.repairStrategy.length).toBeGreaterThan(0);
    });

    it("produces non-empty repairStrategy for unused_variable", () => {
        const result = explainError({ error: "unused_variable" });
        expect(result.found).toBe(true);
        const r = result as ExplainResultFound;
        expect(r.repairStrategy.length).toBeGreaterThan(0);
    });

    it("repairStrategy contains valid action values", () => {
        const result = explainError({ error: "type_mismatch" });
        expect(result.found).toBe(true);
        const r = result as ExplainResultFound;
        for (const action of r.repairStrategy) {
            expect(["change", "add", "remove"]).toContain(action.action);
            expect(typeof action.field).toBe("string");
        }
    });
});

// =============================================================================
// MCP tool wrapper
// =============================================================================

describe("explainTool wrapper", () => {
    it("returns valid JSON response for a known error type", async () => {
        const result = await explainTool.handler({ error: { error: "type_mismatch" } }, {});
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse((result.content[0] as any).text);
        expect(parsed.found).toBe(true);
        expect(parsed.errorType).toBe("type_mismatch");
        expect(parsed.pipelineStage).toBe("type_checker");
    });

    it("returns valid JSON response for unknown error type", async () => {
        const result = await explainTool.handler({ error: { error: "bogus" } }, {});
        const parsed = JSON.parse((result.content[0] as any).text);
        expect(parsed.found).toBe(false);
        expect(parsed.reason).toBe("unknown_error_type");
    });

    it("returns valid JSON response for malformed input", async () => {
        const result = await explainTool.handler({ error: "not_an_object" }, {});
        const parsed = JSON.parse((result.content[0] as any).text);
        expect(parsed.found).toBe(false);
        expect(parsed.reason).toBe("missing_discriminator");
    });
});

// =============================================================================
// Catalog consistency
// =============================================================================

describe("explain catalog consistency", () => {
    const catalog = buildErrorCatalog();

    it("catalog has at least 30 error types", () => {
        expect(catalog.count).toBeGreaterThanOrEqual(30);
    });

    it("every catalog entry produces a valid explain result", () => {
        for (const entry of catalog.errors) {
            const result = explainError({ error: entry.type });
            expect(result.found).toBe(true);
            if (result.found) {
                expect(result.pipelineStage).toBeTruthy();
                expect(Array.isArray(result.fields)).toBe(true);
                expect(Array.isArray(result.repairStrategy)).toBe(true);
            }
        }
    });
});
