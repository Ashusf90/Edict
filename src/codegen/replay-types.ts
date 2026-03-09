// =============================================================================
// Replay Types — shared types for execution recording and replay
// =============================================================================
// Generic entry format: { kind, args, result }. New host functions or adapter
// methods produce valid entries without any type changes.

/**
 * A recorded execution snapshot. Contains all non-deterministic host
 * responses captured during a single WASM execution. Pass this token
 * to edict_replay to reproduce the exact same execution.
 */
export interface ReplayToken {
    /** Sequential log of all non-deterministic host responses. */
    responses: ReplayEntry[];
    /** ISO timestamp of original execution. */
    recordedAt: string;
}

/**
 * A single recorded host call. Generic format — any new host function
 * or adapter method produces a valid entry without type changes.
 */
export interface ReplayEntry {
    /** Host function or adapter method name (e.g., "fetch", "randomInt", "now"). */
    kind: string;
    /** Serializable arguments that were passed to the host function. */
    args: unknown[];
    /** Serializable return value from the host function. */
    result: unknown;
}
