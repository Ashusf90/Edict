// =============================================================================
// Registry sync validation — ensures type signatures and implementations
// cannot drift apart.
// =============================================================================

import { describe, it, expect } from "vitest";
import { ALL_BUILTINS, BUILTIN_FUNCTIONS, isBuiltin, getBuiltin, createHostImports } from "../../src/builtins/registry.js";
import type { RuntimeState } from "../../src/builtins/host-helpers.js";
import { NodeHostAdapter } from "../../src/codegen/node-host-adapter.js";

describe("builtin registry sync", () => {
    // ── Registry integrity ──────────────────────────────────────────────

    it("ALL_BUILTINS has no duplicate names", () => {
        const names = ALL_BUILTINS.map(b => b.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);

        // If duplicates exist, identify them
        if (unique.size !== names.length) {
            const seen = new Set<string>();
            for (const name of names) {
                if (seen.has(name)) {
                    throw new Error(`Duplicate builtin name: ${name}`);
                }
                seen.add(name);
            }
        }
    });

    it("every BuiltinDef has a valid type signature", () => {
        for (const def of ALL_BUILTINS) {
            expect(def.type.kind).toBe("fn_type");
            expect(Array.isArray(def.type.params)).toBe(true);
            expect(def.type.returnType).toBeDefined();
        }
    });

    it("every BuiltinDef has a valid impl", () => {
        for (const def of ALL_BUILTINS) {
            expect(["host", "wasm"]).toContain(def.impl.kind);
            if (def.impl.kind === "host") {
                expect(typeof def.impl.factory).toBe("function");
            } else {
                expect(typeof def.impl.generator).toBe("function");
            }
        }
    });

    // ── BUILTIN_FUNCTIONS derivation ────────────────────────────────────

    it("BUILTIN_FUNCTIONS has same size as ALL_BUILTINS", () => {
        expect(BUILTIN_FUNCTIONS.size).toBe(ALL_BUILTINS.length);
    });

    it("every builtin in ALL_BUILTINS is in BUILTIN_FUNCTIONS", () => {
        for (const def of ALL_BUILTINS) {
            expect(BUILTIN_FUNCTIONS.has(def.name)).toBe(true);
        }
    });

    it("isBuiltin() returns true for all registered builtins", () => {
        for (const def of ALL_BUILTINS) {
            expect(isBuiltin(def.name)).toBe(true);
        }
    });

    it("isBuiltin() returns false for non-builtins", () => {
        expect(isBuiltin("not_a_builtin")).toBe(false);
        expect(isBuiltin("")).toBe(false);
    });

    it("getBuiltin() returns correct type for all registered builtins", () => {
        for (const def of ALL_BUILTINS) {
            const builtin = getBuiltin(def.name);
            expect(builtin).toBeDefined();
            expect(builtin!.type).toBe(def.type);
        }
    });

    it("host builtins get wasmImport ['host', name]", () => {
        for (const def of ALL_BUILTINS) {
            if (def.impl.kind === "host") {
                const builtin = getBuiltin(def.name)!;
                expect(builtin.wasmImport).toEqual(["host", def.name]);
            }
        }
    });

    it("wasm builtins get wasmImport ['__wasm', name]", () => {
        for (const def of ALL_BUILTINS) {
            if (def.impl.kind === "wasm") {
                const builtin = getBuiltin(def.name)!;
                expect(builtin.wasmImport).toEqual(["__wasm", def.name]);
            }
        }
    });

    // ── Host import coverage ────────────────────────────────────────────

    it("createHostImports() returns all host-kind builtins", () => {
        const state: RuntimeState = {
            outputParts: [],
            instance: null,
        };

        const imports = createHostImports(state, new NodeHostAdapter());
        const hostObj = imports["host"] as Record<string, unknown>;

        const expectedHostNames = ALL_BUILTINS
            .filter(b => b.impl.kind === "host")
            .map(b => b.name);

        for (const name of expectedHostNames) {
            expect(hostObj[name]).toBeDefined();
            expect(typeof hostObj[name]).toBe("function");
        }
    });

    it("createHostImports() does NOT include wasm builtins", () => {
        const state: RuntimeState = {
            outputParts: [],
            instance: null,
        };

        const imports = createHostImports(state, new NodeHostAdapter());
        const hostObj = imports["host"] as Record<string, unknown>;

        const wasmNames = ALL_BUILTINS
            .filter(b => b.impl.kind === "wasm")
            .map(b => b.name);

        for (const name of wasmNames) {
            expect(hostObj[name]).toBeUndefined();
        }
    });

    it("no orphan host implementations — every key in host imports is a registered builtin", () => {
        const state: RuntimeState = {
            outputParts: [],
            instance: null,
        };

        const imports = createHostImports(state, new NodeHostAdapter());
        const hostObj = imports["host"] as Record<string, unknown>;

        for (const key of Object.keys(hostObj)) {
            expect(isBuiltin(key)).toBe(true);
        }
    });

    // ── Expected builtin counts ─────────────────────────────────────────

    it("has the expected number of builtins (regression guard)", () => {
        // Update this count when adding new builtins — it prevents accidental removal
        expect(ALL_BUILTINS.length).toBeGreaterThanOrEqual(55);
    });

    it("has both host and wasm builtins", () => {
        const hostCount = ALL_BUILTINS.filter(b => b.impl.kind === "host").length;
        const wasmCount = ALL_BUILTINS.filter(b => b.impl.kind === "wasm").length;
        expect(hostCount).toBeGreaterThan(0);
        expect(wasmCount).toBeGreaterThan(0);
        expect(hostCount + wasmCount).toBe(ALL_BUILTINS.length);
    });
});
