// =============================================================================
// Edict Validator — Main Entry Point
// =============================================================================
// validate(ast: unknown) → { ok: true } | { ok: false, errors: StructuredError[] }
//
// Accepts any JSON value and determines if it's a valid Edict AST.
// Auto-detects modules and fragments based on `kind`.
// If valid, returns success. If invalid, returns ALL errors found.

import type { StructuredError } from "../errors/structured-errors.js";
import { IdTracker } from "./id-tracker.js";
import { validateModule, validateFragment } from "./schema-walker.js";
import { expandCompact } from "../compact/expand.js";
import { migrateToLatest } from "../migration/migrate.js";

export interface ValidationSuccess {
    ok: true;
}

export interface ValidationFailure {
    ok: false;
    errors: StructuredError[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validate an unknown JSON value as an Edict AST (module or fragment).
 *
 * Auto-detects `kind: "module"` vs `kind: "fragment"`.
 * Returns all errors found (does not stop at first error).
 *
 * @param ast - Any JSON value to validate against the Edict AST schema
 * @returns `{ ok: true }` if valid, or `{ ok: false, errors }` with all structural errors
 */
export function validate(ast: unknown): ValidationResult {
    const expanded = expandCompact(ast);
    const migrated = migrateToLatest(expanded);
    if (!migrated.ok) {
        return { ok: false, errors: migrated.errors };
    }
    const finalAst = migrated.ast;

    const errors: StructuredError[] = [];
    const idTracker = new IdTracker();

    // Auto-detect fragment vs module
    if (
        typeof finalAst === "object" &&
        finalAst !== null &&
        !Array.isArray(finalAst) &&
        (finalAst as Record<string, unknown>)["kind"] === "fragment"
    ) {
        validateFragment(finalAst, "$", errors, idTracker);
    } else {
        validateModule(finalAst, "$", errors, idTracker);
    }

    // Add any duplicate ID errors
    errors.push(...idTracker.getErrors());

    if (errors.length === 0) {
        return { ok: true };
    }

    return { ok: false, errors };
}

/**
 * Validate an unknown JSON value specifically as an Edict fragment.
 *
 * Unlike {@link validate}, does not auto-detect module vs fragment —
 * always validates against the fragment schema.
 *
 * @param ast - Any JSON value to validate as an Edict fragment
 * @returns `{ ok: true }` if valid, or `{ ok: false, errors }` with all structural errors
 */
export function validateFragmentAst(ast: unknown): ValidationResult {
    const expanded = expandCompact(ast);
    const migrated = migrateToLatest(expanded);
    if (!migrated.ok) {
        return { ok: false, errors: migrated.errors };
    }
    const finalAst = migrated.ast;

    const errors: StructuredError[] = [];
    const idTracker = new IdTracker();

    validateFragment(finalAst, "$", errors, idTracker);

    errors.push(...idTracker.getErrors());

    if (errors.length === 0) {
        return { ok: true };
    }

    return { ok: false, errors };
}
