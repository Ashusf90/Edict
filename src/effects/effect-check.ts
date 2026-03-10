// =============================================================================
// Effect Checker
// =============================================================================
// Single-pass analysis: verify that each function's declared effects cover
// the effects of the functions it calls.

import type { EdictModule } from "../ast/nodes.js";
import type { StructuredError } from "../errors/structured-errors.js";
import {
    effectViolation,
    effectInPure,
    approvalPropagationMissing,
    analysisDiagnostic,
    type FixSuggestion,
    type AnalysisDiagnostic,
} from "../errors/structured-errors.js";
import { buildCallGraph } from "./call-graph.js";

/**
 * Result of effect checking: errors (violations) + diagnostics (skipped checks).
 */
export interface EffectCheckResult {
    errors: StructuredError[];
    diagnostics: AnalysisDiagnostic[];
}

/**
 * Check effect consistency across all functions in the module.
 *
 * For each function, iterates its call edges (skipping imports):
 * - If caller is `pure`: any callee with non-pure effects → `effect_in_pure` error
 * - If caller is not `pure`: missing caller effects → `effect_violation` error
 *
 * Also checks approval propagation: if a callee requires approval,
 * the caller must also require approval.
 *
 * Skipped checks produce INFO-level diagnostics instead of silent success.
 *
 * @param module - A validated and type-checked Edict module
 * @returns `{ errors, diagnostics }` — effect violation errors and skipped-check diagnostics
 */
export function effectCheck(module: EdictModule): EffectCheckResult {
    const { graph, functionDefs, importedNames } = buildCallGraph(module);
    const errors: StructuredError[] = [];
    const diagnostics: AnalysisDiagnostic[] = [];

    for (const [fnName, fn] of functionDefs) {
        const edges = graph.get(fnName) ?? [];
        const callerEffects = new Set(fn.effects);
        const isPure = callerEffects.has("pure");

        for (const edge of edges) {
            // Skip imported functions — effect-opaque, but report it
            if (importedNames.has(edge.calleeName)) {
                diagnostics.push(analysisDiagnostic(
                    "effect_skipped_import",
                    fnName,
                    fn.id,
                    "effects",
                    edge.calleeName,
                ));
                continue;
            }

            // Skip unknown callees (e.g., parameters used as functions), but report it
            const callee = functionDefs.get(edge.calleeName);
            if (!callee) {
                diagnostics.push(analysisDiagnostic(
                    "effect_skipped_unknown_callee",
                    fnName,
                    fn.id,
                    "effects",
                    edge.calleeName,
                ));
                continue;
            }

            const calleeNonPure = callee.effects.filter(e => e !== "pure");
            if (calleeNonPure.length === 0) continue;

            if (isPure) {
                const suggestion: FixSuggestion = {
                    nodeId: fn.id,
                    field: "effects",
                    value: calleeNonPure,
                };
                errors.push(effectInPure(
                    fn.id,
                    fnName,
                    edge.callSiteNodeId,
                    edge.calleeName,
                    calleeNonPure,
                    suggestion,
                ));
            } else {
                const missing = calleeNonPure.filter(e => !callerEffects.has(e));
                if (missing.length > 0) {
                    const suggestion: FixSuggestion = {
                        nodeId: fn.id,
                        field: "effects",
                        value: [...fn.effects, ...missing],
                    };
                    errors.push(effectViolation(
                        fn.id,
                        fnName,
                        missing,
                        edge.callSiteNodeId,
                        edge.calleeName,
                        suggestion,
                    ));
                }
            }
        }
    }

    // =========================================================================
    // Approval propagation — if callee requires approval, caller must too
    // =========================================================================
    for (const [fnName, fn] of functionDefs) {
        const edges = graph.get(fnName) ?? [];
        const callerApproved = fn.approval?.required === true;

        for (const edge of edges) {
            // Skip imports and unknown callees (already diagnosed above)
            if (importedNames.has(edge.calleeName)) continue;
            const callee = functionDefs.get(edge.calleeName);
            if (!callee) continue;

            // If callee requires approval and caller doesn't → error
            if (callee.approval?.required && !callerApproved) {
                const suggestion: FixSuggestion = {
                    nodeId: fn.id,
                    field: "approval",
                    value: {
                        required: true,
                        scope: callee.approval.scope,
                        description: callee.approval.description,
                    },
                };
                errors.push(approvalPropagationMissing(
                    fn.id,
                    fnName,
                    edge.callSiteNodeId,
                    edge.calleeName,
                    { scope: callee.approval.scope, description: callee.approval.description },
                    suggestion,
                ));
            }
        }
    }

    return { errors, diagnostics };
}
