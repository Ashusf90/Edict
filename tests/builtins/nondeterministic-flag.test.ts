import { describe, it, expect } from "vitest";
import { ALL_BUILTINS } from "../../src/builtins/registry.js";

/**
 * Drift-prevention guard test.
 *
 * All host builtins with "reads" effect must have `nondeterministic` explicitly
 * set (either true or false). This prevents someone from adding a new
 * reads-effect builtin without declaring whether it needs recording.
 *
 * CI breaks if the flag is missing.
 */
describe("nondeterministic flag — drift prevention", () => {
    it("all reads-effect host builtins have nondeterministic explicitly set", () => {
        const missing: string[] = [];
        for (const def of ALL_BUILTINS) {
            if (
                def.impl.kind === "host" &&
                def.type.effects.includes("reads") &&
                def.nondeterministic === undefined
            ) {
                missing.push(def.name);
            }
        }

        expect(
            missing,
            `The following builtins have "reads" effect but no "nondeterministic" flag: ${missing.join(", ")}. ` +
            `Add nondeterministic: true or nondeterministic: false to each BuiltinDef.`,
        ).toEqual([]);
    });

    it("known nondeterministic builtins are tagged correctly", () => {
        const expectedNondet = ["randomInt", "randomFloat", "randomUuid", "now", "env", "args"];

        for (const name of expectedNondet) {
            const def = ALL_BUILTINS.find(b => b.name === name);
            expect(def, `builtin "${name}" not found`).toBeDefined();
            expect(def!.nondeterministic, `builtin "${name}" should be nondeterministic: true`).toBe(true);
        }
    });
});
