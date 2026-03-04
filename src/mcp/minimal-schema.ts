// =============================================================================
// Minimal Schema — Token-optimized JSON Schema variant
// =============================================================================
// Strips description fields from the full schema to reduce token cost.
// The structure IS the documentation — descriptions are redundant for agents.

/**
 * Recursively strip verbosity from a JSON Schema object to minimize token cost:
 * - Remove all "description" keys (the structure IS the documentation)
 * - Remove "type":"string" when "const" is present (JSON Schema infers type from const)
 * Returns a new object — does not mutate the input.
 */
export function stripDescriptions(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
        return obj.map(stripDescriptions);
    }
    if (typeof obj === "object") {
        const source = obj as Record<string, unknown>;
        const hasConst = "const" in source;
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(source)) {
            if (key === "description") continue;
            // When "const" is present, "type":"string" is redundant
            if (key === "type" && typeof value === "string" && hasConst) continue;
            result[key] = stripDescriptions(value);
        }
        return result;
    }
    return obj;
}
