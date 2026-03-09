// =============================================================================
// Error Catalog Staleness Guard
// =============================================================================
// Ensures every catalog entry's example_cause triggers an error and
// example_fix passes check(). Runs in CI to prevent catalog rot.

import { describe, it, expect } from "vitest";
import { buildErrorCatalog } from "../../src/errors/error-catalog.js";
import { check } from "../../src/check.js";

function normalizeModule(ast: Record<string, unknown>): Record<string, unknown> {
    const n = { ...ast };
    if (!n.id) n.id = "mod-guard-001";
    if (!n.imports) n.imports = [];
    return n;
}

const catalog = buildErrorCatalog();

describe("error catalog staleness guard", () => {
    // Filter to module-based entries that go through the pipeline
    const pipelineEntries = catalog.errors.filter(e => {
        const cause = e.example_cause as Record<string, unknown>;
        return cause?.kind === "module" && !["lint", "codegen", "patch", "migration"].includes(e.pipeline_stage);
    });

    describe("every example_cause must trigger an error", () => {
        for (const entry of pipelineEntries) {
            it(`${entry.type} (${entry.pipeline_stage}): cause triggers error`, async () => {
                const cause = normalizeModule(entry.example_cause as Record<string, unknown>);
                const result = await check(cause);
                expect(result.ok).toBe(false);
            });
        }
    });

    describe("every example_fix must pass check()", () => {
        for (const entry of pipelineEntries) {
            it(`${entry.type} (${entry.pipeline_stage}): fix passes`, async () => {
                const fix = normalizeModule(entry.example_fix as Record<string, unknown>);
                const result = await check(fix);
                expect(result.ok).toBe(true);
            });
        }
    });

    it("all pipeline entries are covered", () => {
        // Ensure we actually tested something meaningful
        expect(pipelineEntries.length).toBeGreaterThanOrEqual(20);
    });
});
