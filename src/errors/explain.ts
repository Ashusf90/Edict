// =============================================================================
// Error Explain — Structured repair context derived from the error catalog
// =============================================================================
// Pure function that takes a structured error and returns enriched context:
// pipeline stage, field metadata, example cause/fix, and a repair strategy.
// All derived from the error catalog — no hand-written per-error logic.

import { buildErrorCatalog, type ErrorCatalogEntry } from "./error-catalog.js";

// =============================================================================
// Types
// =============================================================================

/** Structured field difference between example_cause and example_fix */
export interface RepairAction {
    /** Top-level key that differs */
    field: string;
    /** What kind of change is needed */
    action: "change" | "add" | "remove";
}

/** Result when the error type is found in the catalog */
export interface ExplainResultFound {
    found: true;
    /** The error discriminator string */
    errorType: string;
    /** Pipeline stage that produces this error */
    pipelineStage: string;
    /** All fields present on this error type */
    fields: { name: string; type: string }[];
    /** Minimal AST that triggers this error */
    exampleCause: Record<string, unknown>;
    /** The corrected AST that fixes the error */
    exampleFix: Record<string, unknown>;
    /** Structured repair actions derived from cause→fix diff */
    repairStrategy: RepairAction[];
}

/** Result when the error type is not found */
export interface ExplainResultNotFound {
    found: false;
    /** Why lookup failed */
    reason: "missing_discriminator" | "unknown_error_type";
    /** The error type that was looked up (only for unknown_error_type) */
    errorType?: string;
}

export type ExplainResult = ExplainResultFound | ExplainResultNotFound;

// =============================================================================
// Cached catalog index (built once, keyed by error type)
// =============================================================================

let catalogIndex: Map<string, ErrorCatalogEntry> | null = null;

function getCatalogIndex(): Map<string, ErrorCatalogEntry> {
    if (!catalogIndex) {
        const catalog = buildErrorCatalog();
        catalogIndex = new Map<string, ErrorCatalogEntry>();
        for (const entry of catalog.errors) {
            catalogIndex.set(entry.type, entry);
        }
    }
    return catalogIndex;
}

// =============================================================================
// Core function
// =============================================================================

/**
 * Given a structured error object, return enriched repair context derived
 * from the error catalog. The error must have an `error` field (the
 * discriminator string) to be looked up.
 */
export function explainError(error: Record<string, unknown>): ExplainResult {
    // Guard: must have `error` discriminator field
    if (!error || typeof error !== "object" || typeof error.error !== "string") {
        return { found: false, reason: "missing_discriminator" };
    }

    const errorType = error.error as string;
    const index = getCatalogIndex();
    const entry = index.get(errorType);

    if (!entry) {
        return { found: false, reason: "unknown_error_type", errorType };
    }

    // Derive repair strategy from cause → fix diff
    const repairStrategy = deriveRepairStrategy(
        entry.example_cause,
        entry.example_fix,
    );

    return {
        found: true,
        errorType: entry.type,
        pipelineStage: entry.pipeline_stage,
        fields: entry.fields,
        exampleCause: entry.example_cause,
        exampleFix: entry.example_fix,
        repairStrategy,
    };
}

// =============================================================================
// Repair strategy derivation
// =============================================================================

/**
 * Compute a structured diff between example_cause and example_fix at the
 * top level. Identifies which keys were added, removed, or changed.
 */
function deriveRepairStrategy(
    cause: Record<string, unknown>,
    fix: Record<string, unknown>,
): RepairAction[] {
    const actions: RepairAction[] = [];
    const allKeys = new Set([...Object.keys(cause), ...Object.keys(fix)]);

    for (const key of allKeys) {
        const inCause = Object.hasOwn(cause, key);
        const inFix = Object.hasOwn(fix, key);

        if (inCause && !inFix) {
            actions.push({ field: key, action: "remove" });
        } else if (!inCause && inFix) {
            actions.push({ field: key, action: "add" });
        } else if (inCause && inFix) {
            // Both exist — check if they differ
            if (JSON.stringify(cause[key]) !== JSON.stringify(fix[key])) {
                actions.push({ field: key, action: "change" });
            }
        }
    }

    return actions;
}
