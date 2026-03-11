import { describe, it, expect } from "vitest";
import { effectCheck } from "../../src/effects/effect-check.js";
import type { EdictModule, FunctionDef, Expression, ApprovalGate } from "../../src/ast/nodes.js";
import type { ApprovalPropagationMissingError } from "../../src/errors/structured-errors.js";

// =============================================================================
// Helpers
// =============================================================================

function mkIdent(name: string, id?: string): Expression {
    return { kind: "ident", id: id ?? `id-${name}`, name };
}

function mkCall(fnName: string, id?: string): Expression {
    return {
        kind: "call",
        id: id ?? `call-${fnName}`,
        fn: mkIdent(fnName, `id-${fnName}-ref`),
        args: [],
    };
}

function mkFn(
    name: string,
    opts: { effects?: string[]; body?: Expression[]; approval?: ApprovalGate; id?: string } = {},
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
        body: opts.body ?? [{ kind: "literal", id: `lit-${name}`, value: 0 }],
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

const GATE_WIRE: ApprovalGate = { required: true, scope: "per_call", reason: "wire_transfer" };
const GATE_DELETE: ApprovalGate = { required: true, scope: "per_session", reason: "delete_data" };

// =============================================================================
// Tests
// =============================================================================

describe("Approval gate propagation", () => {
    it("should pass when gated caller calls gated callee", () => {
        const mod = mkModule([
            mkFn("transfer", { effects: ["io"], approval: GATE_WIRE, body: [{ kind: "literal", id: "lit-1", value: 1 }] }),
            mkFn("process", { effects: ["io"], approval: GATE_WIRE, body: [mkCall("transfer")] }),
        ]);
        const { errors } = effectCheck(mod);
        const approvalErrors = errors.filter(e => e.error === "approval_propagation_missing");
        expect(approvalErrors).toHaveLength(0);
    });

    it("should error when non-gated caller calls gated callee", () => {
        const mod = mkModule([
            mkFn("transfer", { effects: ["io"], approval: GATE_WIRE, body: [{ kind: "literal", id: "lit-1", value: 1 }] }),
            mkFn("process", { effects: ["io"], body: [mkCall("transfer")] }),
        ]);
        const { errors } = effectCheck(mod);
        const approvalErrors = errors.filter(e => e.error === "approval_propagation_missing");
        expect(approvalErrors).toHaveLength(1);

        const err = approvalErrors[0] as ApprovalPropagationMissingError;
        expect(err.functionName).toBe("process");
        expect(err.calleeName).toBe("transfer");
        expect(err.calleeApproval).toEqual({ scope: "per_call", reason: "wire_transfer" });
    });

    it("should pass for a 3-deep gated chain: A(gated) → B(gated) → C(gated)", () => {
        const mod = mkModule([
            mkFn("innerOp", { effects: ["io"], approval: GATE_WIRE, body: [{ kind: "literal", id: "lit-1", value: 1 }] }),
            mkFn("middleOp", { effects: ["io"], approval: GATE_WIRE, body: [mkCall("innerOp")] }),
            mkFn("outerOp", { effects: ["io"], approval: GATE_WIRE, body: [mkCall("middleOp")] }),
        ]);
        const { errors } = effectCheck(mod);
        const approvalErrors = errors.filter(e => e.error === "approval_propagation_missing");
        expect(approvalErrors).toHaveLength(0);
    });

    it("should error at the first non-gated link in a chain", () => {
        const mod = mkModule([
            mkFn("innerOp", { effects: ["io"], approval: GATE_DELETE, body: [{ kind: "literal", id: "lit-1", value: 1 }] }),
            mkFn("middleOp", { effects: ["io"], body: [mkCall("innerOp")] }), // missing approval
            mkFn("outerOp", { effects: ["io"], approval: GATE_DELETE, body: [mkCall("middleOp")] }),
        ]);
        const { errors } = effectCheck(mod);
        const approvalErrors = errors.filter(e => e.error === "approval_propagation_missing");
        // middleOp calls innerOp (gated) without being gated → error
        expect(approvalErrors).toHaveLength(1);
        expect((approvalErrors[0] as ApprovalPropagationMissingError).functionName).toBe("middleOp");
    });

    it("should skip imported functions (approval-opaque)", () => {
        const mod: EdictModule = {
            kind: "module",
            id: "mod-test",
            name: "test",
            imports: [{ kind: "import", id: "imp-1", module: "payments", names: ["charge"] }],
            definitions: [
                mkFn("process", { effects: ["io"], body: [mkCall("charge")] }),
            ],
        };
        const { errors } = effectCheck(mod);
        const approvalErrors = errors.filter(e => e.error === "approval_propagation_missing");
        expect(approvalErrors).toHaveLength(0);
    });

    it("should not error when calling a non-gated callee", () => {
        const mod = mkModule([
            mkFn("helper", { effects: ["pure"], body: [{ kind: "literal", id: "lit-1", value: 1 }] }),
            mkFn("caller", { effects: ["pure"], body: [mkCall("helper")] }),
        ]);
        const { errors } = effectCheck(mod);
        const approvalErrors = errors.filter(e => e.error === "approval_propagation_missing");
        expect(approvalErrors).toHaveLength(0);
    });

    it("should include correct suggestion in the error", () => {
        const mod = mkModule([
            mkFn("transfer", { effects: ["io"], approval: GATE_WIRE, body: [{ kind: "literal", id: "lit-1", value: 1 }] }),
            mkFn("process", { effects: ["io"], body: [mkCall("transfer")] }),
        ]);
        const { errors } = effectCheck(mod);
        const err = errors.find(e => e.error === "approval_propagation_missing") as ApprovalPropagationMissingError;
        expect(err.suggestion).toBeDefined();
        expect(err.suggestion!.nodeId).toBe("fn-process");
        expect(err.suggestion!.field).toBe("approval");
        expect(err.suggestion!.value).toEqual({
            required: true,
            scope: "per_call",
            reason: "wire_transfer",
        });
    });

    it("should report callSiteNodeId in the error", () => {
        const mod = mkModule([
            mkFn("transfer", { effects: ["io"], approval: GATE_WIRE, body: [{ kind: "literal", id: "lit-1", value: 1 }] }),
            mkFn("process", { effects: ["io"], body: [mkCall("transfer", "call-site-123")] }),
        ]);
        const { errors } = effectCheck(mod);
        const err = errors.find(e => e.error === "approval_propagation_missing") as ApprovalPropagationMissingError;
        expect(err.callSiteNodeId).toBe("call-site-123");
    });
});
