// =============================================================================
// Error Recovery Corpus — programmatically derived from the Error Catalog
// =============================================================================
// Instead of hand-writing broken ASTs, we extract them from buildErrorCatalog()
// which already maintains example_cause/example_fix pairs for every error type.
// This ensures the corpus stays in sync with the compiler's actual error types.

import { buildErrorCatalog, type ErrorCatalogEntry } from "../../src/errors/error-catalog.js";
import { check } from "../../src/check.js";

export interface CorpusEntry {
    /** Unique ID for the entry (e.g., "catalog-type_mismatch") */
    id: string;
    /** Error type this entry targets */
    targetErrors: string[];
    /** Pipeline stage */
    stage: string;
    /** Difficulty: 1 = single error, catalog-derived; 2+ = hand-crafted edge cases */
    difficulty: 1 | 2 | 3;
    /** The broken AST */
    brokenAst: Record<string, unknown>;
    /** The corrected AST */
    fixedAst: Record<string, unknown>;
    /** Source: "catalog" for auto-derived, "manual" for hand-crafted supplements */
    source: "catalog" | "manual";
}

/**
 * Map from catalog pipeline_stage names to our canonical stage names.
 */
const STAGE_MAP: Record<string, string> = {
    validator: "validator",
    resolver: "resolver",
    type_checker: "type_checker",
    effect_checker: "effect_checker",
    contract_verifier: "contract_verifier",
    codegen: "codegen",
    patch: "patch",
    lint: "lint",
};

/**
 * Build the benchmark corpus by extracting example_cause/example_fix pairs
 * from the error catalog. Filters out entries that lack valid AST modules
 * (e.g., patch entries that use a different input format, or entries with
 * placeholder notes instead of real ASTs).
 */
export async function buildCorpus(): Promise<CorpusEntry[]> {
    const catalog = buildErrorCatalog();
    const candidates: CorpusEntry[] = [];

    for (const catalogEntry of catalog.errors) {
        // Skip entries without proper module ASTs (patch ops, placeholder notes)
        if (!isValidModuleAst(catalogEntry.example_cause) || !isValidModuleAst(catalogEntry.example_fix)) {
            continue;
        }

        // Skip lint warnings — they're non-blocking and don't need "recovery"
        if (catalogEntry.pipeline_stage === "lint") continue;

        // Skip codegen errors — these are internal compiler errors, not agent-fixable
        if (catalogEntry.pipeline_stage === "codegen") continue;

        candidates.push({
            id: `catalog-${catalogEntry.type}`,
            targetErrors: [catalogEntry.type],
            stage: STAGE_MAP[catalogEntry.pipeline_stage] ?? catalogEntry.pipeline_stage,
            difficulty: 1,
            brokenAst: normalizeModule(catalogEntry.example_cause as Record<string, unknown>),
            fixedAst: normalizeModule(catalogEntry.example_fix as Record<string, unknown>),
            source: "catalog",
        });
    }

    // Add hand-crafted multi-error and edge-case entries
    candidates.push(...buildManualEntries());

    // Runtime validation: filter out stale entries whose broken AST no longer
    // triggers errors (catalog example may be outdated after schema changes).
    // This keeps the corpus self-syncing with compiler evolution.
    const entries: CorpusEntry[] = [];
    for (const entry of candidates) {
        const result = await check(entry.brokenAst);
        if (result.ok) {
            // Stale: broken AST passes — skip silently
            continue;
        }
        entries.push(entry);
    }

    return entries;
}

/**
 * Check if an object looks like a valid Edict module AST (has kind: "module").
 */
function isValidModuleAst(obj: Record<string, unknown>): boolean {
    return typeof obj === "object" && obj !== null && obj.kind === "module";
}

/**
 * Normalize a module AST to ensure it has all required top-level fields.
 * The error catalog examples predate schema-walker validation (#90) which
 * requires `id` and `imports` on every module. This adds defaults if missing.
 */
function normalizeModule(ast: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...ast };
    if (!normalized.id) normalized.id = "mod-bench-001";
    if (!normalized.imports) normalized.imports = [];
    return normalized;
}

// =============================================================================
// Manual supplement entries — edge cases the catalog doesn't cover
// =============================================================================
// These add harder multi-error scenarios and near-miss cases that test whether
// the repair strategy handles cascading errors and ambiguous fixes.

function buildManualEntries(): CorpusEntry[] {
    return [
        // ME01: Near-miss typo in function call — tests Levenshtein suggestion usage
        {
            id: "manual-typo-fn-call",
            targetErrors: ["undefined_reference"],
            stage: "resolver",
            difficulty: 2,
            source: "manual",
            brokenAst: {
                kind: "module", name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "compute", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "binop", id: "bin-001", op: "+", left: { kind: "ident", id: "id-001", name: "x" }, right: { kind: "literal", id: "lit-001", value: 1 } }] },
                    { kind: "fn", id: "fn-002", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-fn-001", name: "compuet" }, args: [{ kind: "literal", id: "lit-002", value: 5 }] }] },
                ],
            },
            fixedAst: {
                kind: "module", name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "compute", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "binop", id: "bin-001", op: "+", left: { kind: "ident", id: "id-001", name: "x" }, right: { kind: "literal", id: "lit-001", value: 1 } }] },
                    { kind: "fn", id: "fn-002", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-fn-001", name: "compute" }, args: [{ kind: "literal", id: "lit-002", value: 5 }] }] },
                ],
            },
        },

        // ME02: Transitive effect violation — chain of calls requiring io
        {
            id: "manual-transitive-effect",
            targetErrors: ["effect_violation"],
            stage: "effect_checker",
            difficulty: 2,
            source: "manual",
            brokenAst: {
                kind: "module", name: "test",
                imports: [{ kind: "import", id: "imp-001", module: "std", names: ["print"] }],
                definitions: [
                    { kind: "fn", id: "fn-001", name: "doIO", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-print", name: "print" }, args: [{ kind: "literal", id: "lit-001", value: "log" }] }, { kind: "literal", id: "lit-002", value: 1 }] },
                    { kind: "fn", id: "fn-002", name: "wrapper", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-002", fn: { kind: "ident", id: "id-doio", name: "doIO" }, args: [] }] },
                    { kind: "fn", id: "fn-003", name: "main", params: [], effects: ["reads"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-003", fn: { kind: "ident", id: "id-wrap", name: "wrapper" }, args: [] }] },
                ],
            },
            fixedAst: {
                kind: "module", name: "test",
                imports: [{ kind: "import", id: "imp-001", module: "std", names: ["print"] }],
                definitions: [
                    { kind: "fn", id: "fn-001", name: "doIO", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-print", name: "print" }, args: [{ kind: "literal", id: "lit-001", value: "log" }] }, { kind: "literal", id: "lit-002", value: 1 }] },
                    { kind: "fn", id: "fn-002", name: "wrapper", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-002", fn: { kind: "ident", id: "id-doio", name: "doIO" }, args: [] }] },
                    { kind: "fn", id: "fn-003", name: "main", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-003", fn: { kind: "ident", id: "id-wrap", name: "wrapper" }, args: [] }] },
                ],
            },
        },

        // ME03: Duplicate ID between function and its param
        {
            id: "manual-dup-id-fn-param",
            targetErrors: ["duplicate_id"],
            stage: "validator",
            difficulty: 1,
            source: "manual",
            brokenAst: {
                kind: "module", name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "main", params: [{ kind: "param", id: "fn-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-001", name: "x" }] },
                ],
            },
            fixedAst: {
                kind: "module", name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "main", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-001", name: "x" }] },
                ],
            },
        },

        // ME04: Contract postcondition "result > 0" but body returns x*x (fails on 0)
        {
            id: "manual-contract-off-by-one",
            targetErrors: ["contract_failure"],
            stage: "contract_verifier",
            difficulty: 2,
            source: "manual",
            brokenAst: {
                kind: "module", name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "square", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "post", id: "post-001", condition: { kind: "binop", id: "cmp-001", op: ">", left: { kind: "ident", id: "id-r", name: "result" }, right: { kind: "literal", id: "lit-z", value: 0 } } }], body: [{ kind: "binop", id: "bin-001", op: "*", left: { kind: "ident", id: "id-001", name: "x" }, right: { kind: "ident", id: "id-002", name: "x" } }] }],
            },
            fixedAst: {
                kind: "module", name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "square", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "post", id: "post-001", condition: { kind: "binop", id: "cmp-001", op: ">=", left: { kind: "ident", id: "id-r", name: "result" }, right: { kind: "literal", id: "lit-z", value: 0 } } }], body: [{ kind: "binop", id: "bin-001", op: "*", left: { kind: "ident", id: "id-001", name: "x" }, right: { kind: "ident", id: "id-002", name: "x" } }] }],
            },
        },

        // ME05: If branches return different types
        {
            id: "manual-if-branch-mismatch",
            targetErrors: ["type_mismatch"],
            stage: "type_checker",
            difficulty: 1,
            source: "manual",
            brokenAst: {
                kind: "module", name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "if", id: "if-001", condition: { kind: "binop", id: "cmp-001", op: ">", left: { kind: "ident", id: "id-001", name: "x" }, right: { kind: "literal", id: "lit-001", value: 0 } }, then: [{ kind: "literal", id: "lit-002", value: 42 }], else: [{ kind: "literal", id: "lit-003", value: "negative" }] }] }],
            },
            fixedAst: {
                kind: "module", name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "if", id: "if-001", condition: { kind: "binop", id: "cmp-001", op: ">", left: { kind: "ident", id: "id-001", name: "x" }, right: { kind: "literal", id: "lit-001", value: 0 } }, then: [{ kind: "literal", id: "lit-002", value: 42 }], else: [{ kind: "literal", id: "lit-003", value: -1 }] }] }],
            },
        },

        // ME06: Missing record fields in construction (multiple missing)
        {
            id: "manual-missing-multiple-fields",
            targetErrors: ["missing_record_fields"],
            stage: "type_checker",
            difficulty: 2,
            source: "manual",
            brokenAst: {
                kind: "module", name: "test",
                definitions: [
                    { kind: "record", id: "rec-001", name: "Config", fields: [{ kind: "field", id: "fld-host", name: "host", type: { kind: "basic", name: "String" } }, { kind: "field", id: "fld-port", name: "port", type: { kind: "basic", name: "Int" } }, { kind: "field", id: "fld-debug", name: "debug", type: { kind: "basic", name: "Bool" } }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "named", name: "Config" }, contracts: [], body: [{ kind: "record_expr", id: "re-001", name: "Config", fields: [{ kind: "field_init", name: "host", value: { kind: "literal", id: "lit-001", value: "localhost" } }] }] },
                ],
            },
            fixedAst: {
                kind: "module", name: "test",
                definitions: [
                    { kind: "record", id: "rec-001", name: "Config", fields: [{ kind: "field", id: "fld-host", name: "host", type: { kind: "basic", name: "String" } }, { kind: "field", id: "fld-port", name: "port", type: { kind: "basic", name: "Int" } }, { kind: "field", id: "fld-debug", name: "debug", type: { kind: "basic", name: "Bool" } }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "named", name: "Config" }, contracts: [], body: [{ kind: "record_expr", id: "re-001", name: "Config", fields: [{ kind: "field_init", name: "host", value: { kind: "literal", id: "lit-001", value: "localhost" } }, { kind: "field_init", name: "port", value: { kind: "literal", id: "lit-002", value: 8080 } }, { kind: "field_init", name: "debug", value: { kind: "literal", id: "lit-003", value: false } }] }] },
                ],
            },
        },
    ].map(entry => ({
        ...entry,
        brokenAst: normalizeModule(entry.brokenAst),
        fixedAst: normalizeModule(entry.fixedAst),
    }));
}
