import { describe, it, expect } from "vitest";
import { lint } from "../../src/lint/lint.js";
import type { EdictModule, FunctionDef, ApprovalGate } from "../../src/ast/nodes.js";
import type { ApprovalMissingOnIoWarning } from "../../src/lint/warnings.js";

// =============================================================================
// Helpers
// =============================================================================

function mkFn(
    name: string,
    opts: { effects?: string[]; approval?: ApprovalGate; id?: string } = {},
): FunctionDef {
    return {
        kind: "fn",
        id: opts.id ?? `fn-${name}`,
        name,
        params: [],
        effects: (opts.effects ?? ["pure"]) as FunctionDef["effects"],
        returnType: { kind: "basic", name: "Int" },
        contracts: [],
        approval: opts.approval,
        body: [{ kind: "literal", id: `lit-${name}`, value: 0 }],
    };
}

function mkModule(fns: FunctionDef[]): EdictModule {
    return {
        kind: "module",
        id: "mod-test",
        name: "test",
        imports: [],
        definitions: fns,
    };
}

const GATE: ApprovalGate = { required: true, scope: "per_call", description: "wire_transfer" };

// =============================================================================
// Tests
// =============================================================================

describe("approval_missing_on_io lint warning", () => {
    it("should warn when IO function has no approval gate", () => {
        const mod = mkModule([
            mkFn("sender", { effects: ["io"] }),
        ]);
        const warnings = lint(mod);
        const approvalWarnings = warnings.filter(w => w.warning === "approval_missing_on_io");
        expect(approvalWarnings).toHaveLength(1);

        const w = approvalWarnings[0] as ApprovalMissingOnIoWarning;
        expect(w.functionName).toBe("sender");
        expect(w.effects).toContain("io");
    });

    it("should NOT warn when IO function has approval gate", () => {
        const mod = mkModule([
            mkFn("sender", { effects: ["io"], approval: GATE }),
        ]);
        const warnings = lint(mod);
        const approvalWarnings = warnings.filter(w => w.warning === "approval_missing_on_io");
        expect(approvalWarnings).toHaveLength(0);
    });

    it("should NOT warn for pure functions", () => {
        const mod = mkModule([
            mkFn("helper", { effects: ["pure"] }),
        ]);
        const warnings = lint(mod);
        const approvalWarnings = warnings.filter(w => w.warning === "approval_missing_on_io");
        expect(approvalWarnings).toHaveLength(0);
    });

    it("should NOT warn for main (entry point)", () => {
        const mod = mkModule([
            mkFn("main", { effects: ["io"] }),
        ]);
        const warnings = lint(mod);
        const approvalWarnings = warnings.filter(w => w.warning === "approval_missing_on_io");
        expect(approvalWarnings).toHaveLength(0);
    });

    it("should warn for reads-only functions (non-IO)", () => {
        const mod = mkModule([
            mkFn("reader", { effects: ["reads"] }),
        ]);
        const warnings = lint(mod);
        const approvalWarnings = warnings.filter(w => w.warning === "approval_missing_on_io");
        // reads is not io, so no warning
        expect(approvalWarnings).toHaveLength(0);
    });
});
