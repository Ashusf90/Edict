// =============================================================================
// Error Recovery Benchmark Tests
// =============================================================================
// Ensures the benchmark infrastructure itself works correctly.

import { describe, it, expect } from "vitest";
import { buildCorpus } from "../../benchmarks/error-recovery/corpus.js";
import { runBenchmark, mockRepairStrategy } from "../../benchmarks/error-recovery/runner.js";
import { check } from "../../src/check.js";
import { buildErrorCatalog } from "../../src/errors/error-catalog.js";

describe("Error Recovery Benchmark", () => {

    describe("corpus", () => {
        it("derives entries from the error catalog", async () => {
            const corpus = await buildCorpus();
            const catalogEntries = corpus.filter(e => e.source === "catalog");
            expect(catalogEntries.length).toBeGreaterThan(0);
            // Should have entries from multiple stages
            const stages = new Set(catalogEntries.map(e => e.stage));
            expect(stages.size).toBeGreaterThanOrEqual(3);
        });

        it("includes manual edge-case entries", async () => {
            const corpus = await buildCorpus();
            const manualEntries = corpus.filter(e => e.source === "manual");
            expect(manualEntries.length).toBeGreaterThan(0);
        });

        it("all entries have unique IDs", async () => {
            const corpus = await buildCorpus();
            const ids = corpus.map(e => e.id);
            expect(new Set(ids).size).toBe(ids.length);
        });

        it("every included broken AST actually fails the pipeline", async () => {
            // buildCorpus() pre-filters stale entries, so all should fail
            const corpus = await buildCorpus();
            for (const entry of corpus) {
                const result = await check(entry.brokenAst);
                expect(result.ok, `Entry ${entry.id} should fail but passed`).toBe(false);
            }
        }, 30_000);

        it("catalog-derived fixed ASTs pass the pipeline", async () => {
            const corpus = await buildCorpus();
            const catalogEntries = corpus.filter(e => e.source === "catalog");
            const passing: string[] = [];
            const failing: string[] = [];
            for (const entry of catalogEntries) {
                const result = await check(entry.fixedAst);
                if (result.ok) {
                    passing.push(entry.id);
                } else {
                    failing.push(entry.id);
                }
            }
            // Most catalog fixes should pass; some may be stale but we report them
            const passRate = catalogEntries.length > 0 ? passing.length / catalogEntries.length : 0;
            expect(passRate, `Only ${passing.length}/${catalogEntries.length} catalog fixes pass. Failing: ${failing.join(", ")}`).toBeGreaterThan(0.95);
        }, 30_000);
    });

    describe("mock repair strategy", () => {
        it("can handle empty error array", () => {
            const result = mockRepairStrategy.repair({}, [], 0);
            expect(result).toBeNull();
        });

        it("returns non-null for known error types", () => {
            const result = mockRepairStrategy.repair(
                { kind: "module", name: "test", id: "mod-001", imports: [], definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure", "io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }] },
                [{ error: "conflicting_effects", nodeId: "fn-001", effectsFound: ["pure", "io"] }],
                0,
            );
            expect(result).not.toBeNull();
        });
    });

    describe("runner", () => {
        it("produces structured results", async () => {
            const results = await runBenchmark();
            expect(results.strategy).toBe("mock-deterministic");
            expect(results.corpusSize).toBeGreaterThan(0);
            expect(results.summary.recoveryRate).toBeGreaterThanOrEqual(0);
            expect(results.summary.recoveryRate).toBeLessThanOrEqual(1);
            expect(results.entries.length).toBe(results.corpusSize);
        }, 60_000);

        it("recovers at least some entries", async () => {
            const results = await runBenchmark();
            const recovered = results.entries.filter(e => e.recovered);
            expect(recovered.length).toBeGreaterThan(0);
        }, 60_000);

        it("reports breakdowns by stage and difficulty", async () => {
            const results = await runBenchmark();
            expect(Object.keys(results.summary.byStage).length).toBeGreaterThan(0);
            expect(Object.keys(results.summary.byDifficulty).length).toBeGreaterThan(0);
        }, 60_000);

        it("CI regression gate: recovery rate stays above threshold", async () => {
            const results = await runBenchmark();
            expect(
                results.summary.recoveryRate,
                `Recovery rate ${(results.summary.recoveryRate * 100).toFixed(1)}% dropped below CI threshold. ` +
                `Failed entries: ${results.entries.filter(e => !e.recovered).map(e => e.id).join(", ")}`,
            ).toBeGreaterThanOrEqual(0.55);
        }, 60_000);
    });
});
