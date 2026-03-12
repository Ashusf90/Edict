import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

describe("CJS require() error", () => {
    const cjsErrorPath = resolve(import.meta.dirname, "../../cjs-error.cjs");

    it("throws an actionable error when required", () => {
        // Run in a separate Node process with CJS evaluation
        const result = execFileSync(
            process.execPath,
            ["-e", `try { require("${cjsErrorPath}"); process.exit(1); } catch(e) { console.log(e.message); }`],
            { encoding: "utf-8" },
        );

        expect(result).toContain("edict-lang is ESM-only");
        expect(result).toContain('"type": "module"');
        expect(result).toContain("import");
        expect(result).toContain("require");
    });

    it("error message includes all three fix options", () => {
        const result = execFileSync(
            process.execPath,
            ["-e", `try { require("${cjsErrorPath}"); } catch(e) { console.log(e.message); }`],
            { encoding: "utf-8" },
        );

        // Option 1: add type module
        expect(result).toContain('"type": "module"');
        // Option 2: use import syntax
        expect(result).toContain('import { check, compile, run } from "edict-lang"');
        // Option 3: dynamic import
        expect(result).toContain('await import("edict-lang")');
    });
});
