// =============================================================================
// Error Catalog — Machine-readable catalog of all structured error types
// =============================================================================
// Auto-generated from the StructuredError union in structured-errors.ts.
// Agents can pre-learn every error type before encountering them, reducing
// discovery-by-failure round-trips.

/**
 * A single entry in the error catalog.
 */
export interface ErrorCatalogEntry {
    /** Discriminator string (e.g., "type_mismatch") */
    type: string;
    /** Pipeline stage that produces this error */
    pipeline_stage: "validator" | "resolver" | "type_checker" | "complexity_checker" | "effect_checker" | "contract_verifier" | "codegen" | "patch" | "lint";
    /** All fields present on this error (excluding the `error` discriminator) */
    fields: { name: string; type: string }[];
    /** Minimal AST that triggers this error */
    example_cause: Record<string, unknown>;
    /** The corrected AST that fixes the error */
    example_fix: Record<string, unknown>;
}

/**
 * The full error catalog returned by the edict://errors resource.
 */
export interface ErrorCatalog {
    /** Total number of error types */
    count: number;
    /** All error types grouped by pipeline stage */
    errors: ErrorCatalogEntry[];
}

/**
 * Build the complete error catalog. This is a pure function with no dependencies
 * on runtime state — the catalog is static and derived from type definitions.
 */
export function buildErrorCatalog(): ErrorCatalog {
    const errors: ErrorCatalogEntry[] = [
        // =====================================================================
        // Phase 1 — Validation errors
        // =====================================================================
        {
            type: "duplicate_id",
            pipeline_stage: "validator",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "firstPath", type: "string" },
                { name: "secondPath", type: "string" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-main-001", name: "main", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 1 }] },
                    { kind: "fn", id: "fn-main-001", name: "helper", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-002", value: 2 }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-main-001", name: "main", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 1 }] },
                    { kind: "fn", id: "fn-helper-001", name: "helper", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-002", value: 2 }] },
                ],
            },
        },
        {
            type: "unknown_node_kind",
            pipeline_stage: "validator",
            fields: [
                { name: "path", type: "string" },
                { name: "received", type: "string" },
                { name: "validKinds", type: "string[]" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "function", id: "fn-001", name: "main" }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
        },
        {
            type: "missing_field",
            pipeline_stage: "validator",
            fields: [
                { name: "path", type: "string" },
                { name: "nodeId", type: "string | null" },
                { name: "field", type: "string" },
                { name: "expectedFormat", type: "string" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main" }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
        },
        {
            type: "invalid_field_type",
            pipeline_stage: "validator",
            fields: [
                { name: "path", type: "string" },
                { name: "nodeId", type: "string | null" },
                { name: "field", type: "string" },
                { name: "expectedFormat", type: "string" },
                { name: "actualFormat", type: "string" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: 42, params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
        },
        {
            type: "invalid_effect",
            pipeline_stage: "validator",
            fields: [
                { name: "path", type: "string" },
                { name: "nodeId", type: "string | null" },
                { name: "received", type: "string" },
                { name: "validEffects", type: "string[]" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["network"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
        },
        {
            type: "invalid_operator",
            pipeline_stage: "validator",
            fields: [
                { name: "path", type: "string" },
                { name: "nodeId", type: "string | null" },
                { name: "received", type: "string" },
                { name: "validOperators", type: "string[]" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "binop", id: "binop-001", op: "**", left: { kind: "literal", id: "lit-001", value: 2 }, right: { kind: "literal", id: "lit-002", value: 3 } }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "binop", id: "binop-001", op: "*", left: { kind: "literal", id: "lit-001", value: 2 }, right: { kind: "literal", id: "lit-002", value: 3 } }] }],
            },
        },
        {
            type: "invalid_basic_type_name",
            pipeline_stage: "validator",
            fields: [
                { name: "path", type: "string" },
                { name: "nodeId", type: "string | null" },
                { name: "received", type: "string" },
                { name: "validNames", type: "string[]" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Integer" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
        },
        {
            type: "conflicting_effects",
            pipeline_stage: "validator",
            fields: [
                { name: "path", type: "string" },
                { name: "nodeId", type: "string | null" },
                { name: "effectsFound", type: "string[]" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure", "io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
        },

        // =====================================================================
        // Phase 2a — Name resolution errors
        // =====================================================================
        {
            type: "undefined_reference",
            pipeline_stage: "resolver",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "name", type: "string" },
                { name: "candidates", type: "string[]" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-001", name: "undeclaredVar" }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 42 }] }],
            },
        },
        {
            type: "duplicate_definition",
            pipeline_stage: "resolver",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "name", type: "string" },
                { name: "firstNodeId", type: "string | null" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 1 }] },
                    { kind: "fn", id: "fn-002", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-002", value: 2 }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 1 }] },
                    { kind: "fn", id: "fn-002", name: "helper", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-002", value: 2 }] },
                ],
            },
        },
        {
            type: "unknown_record",
            pipeline_stage: "resolver",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "name", type: "string" },
                { name: "candidates", type: "string[]" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "record_expr", id: "rec-001", name: "NonExistent", fields: [] }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "record", id: "rec-def-001", name: "Point", fields: [{ kind: "field", id: "fld-x-001", name: "x", type: { kind: "basic", name: "Int" } }, { kind: "field", id: "fld-y-001", name: "y", type: { kind: "basic", name: "Int" } }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "named", name: "Point" }, contracts: [], body: [{ kind: "record_expr", id: "rec-001", name: "Point", fields: [{ kind: "field_init", name: "x", value: { kind: "literal", id: "lit-001", value: 0 } }, { kind: "field_init", name: "y", value: { kind: "literal", id: "lit-002", value: 0 } }] }] },
                ],
            },
        },
        {
            type: "unknown_enum",
            pipeline_stage: "resolver",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "name", type: "string" },
                { name: "candidates", type: "string[]" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "enum_constructor", id: "en-001", enumName: "NonExistent", variant: "A", fields: [{ kind: "field_init", name: "value", value: { kind: "literal", id: "lit-001", value: 1 } }] }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "enum", id: "enum-def-001", name: "Color", variants: [{ kind: "variant", id: "var-red-001", name: "Red", fields: [{ kind: "field", id: "fld-r-001", name: "value", type: { kind: "basic", name: "Int" } }] }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "named", name: "Color" }, contracts: [], body: [{ kind: "enum_constructor", id: "en-001", enumName: "Color", variant: "Red", fields: [{ kind: "field_init", name: "value", value: { kind: "literal", id: "lit-001", value: 1 } }] }] },
                ],
            },
        },
        {
            type: "unknown_variant",
            pipeline_stage: "resolver",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "enumName", type: "string" },
                { name: "variantName", type: "string" },
                { name: "availableVariants", type: "string[]" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "enum", id: "enum-001", name: "Color", variants: [{ kind: "variant", id: "var-red-002", name: "Red", fields: [{ kind: "field", id: "fld-r-002", name: "value", type: { kind: "basic", name: "Int" } }] }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "enum_constructor", id: "en-001", enumName: "Color", variant: "Blue", fields: [{ kind: "field_init", name: "value", value: { kind: "literal", id: "lit-001", value: 1 } }] }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "enum", id: "enum-001", name: "Color", variants: [{ kind: "variant", id: "var-red-003", name: "Red", fields: [{ kind: "field", id: "fld-r-003", name: "value", type: { kind: "basic", name: "Int" } }] }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "named", name: "Color" }, contracts: [], body: [{ kind: "enum_constructor", id: "en-001", enumName: "Color", variant: "Red", fields: [{ kind: "field_init", name: "value", value: { kind: "literal", id: "lit-001", value: 1 } }] }] },
                ],
            },
        },

        // =====================================================================
        // Phase 2b — Type checking errors
        // =====================================================================
        {
            type: "type_mismatch",
            pipeline_stage: "type_checker",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "expected", type: "TypeExpr" },
                { name: "actual", type: "TypeExpr" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: "hello" }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 42 }] }],
            },
        },
        {
            type: "arity_mismatch",
            pipeline_stage: "type_checker",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "expected", type: "number" },
                { name: "actual", type: "number" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "add", params: [{ kind: "param", id: "p-001", name: "a", type: { kind: "basic", name: "Int" } }, { kind: "param", id: "p-002", name: "b", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "binop", id: "bin-001", op: "+", left: { kind: "ident", id: "id-001", name: "a" }, right: { kind: "ident", id: "id-002", name: "b" } }] },
                    { kind: "fn", id: "fn-002", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-add-001", name: "add" }, args: [{ kind: "literal", id: "lit-001", value: 1 }] }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "add", params: [{ kind: "param", id: "p-001", name: "a", type: { kind: "basic", name: "Int" } }, { kind: "param", id: "p-002", name: "b", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "binop", id: "bin-001", op: "+", left: { kind: "ident", id: "id-001", name: "a" }, right: { kind: "ident", id: "id-002", name: "b" } }] },
                    { kind: "fn", id: "fn-002", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-add-002", name: "add" }, args: [{ kind: "literal", id: "lit-001", value: 1 }, { kind: "literal", id: "lit-002", value: 2 }] }] },
                ],
            },
        },
        {
            type: "not_a_function",
            pipeline_stage: "type_checker",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "actualType", type: "TypeExpr" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-x-call", name: "x" }, args: [] }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-001", name: "x" }] }],
            },
        },
        {
            type: "unknown_field",
            pipeline_stage: "type_checker",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "recordName", type: "string" },
                { name: "fieldName", type: "string" },
                { name: "availableFields", type: "string[]" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "record", id: "rec-001", name: "Point", fields: [{ kind: "field", id: "fld-x-002", name: "x", type: { kind: "basic", name: "Int" } }, { kind: "field", id: "fld-y-002", name: "y", type: { kind: "basic", name: "Int" } }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [{ kind: "param", id: "p-001", name: "p", type: { kind: "named", name: "Point" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "access", id: "acc-001", target: { kind: "ident", id: "id-001", name: "p" }, field: "z" }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "record", id: "rec-001", name: "Point", fields: [{ kind: "field", id: "fld-x-003", name: "x", type: { kind: "basic", name: "Int" } }, { kind: "field", id: "fld-y-003", name: "y", type: { kind: "basic", name: "Int" } }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [{ kind: "param", id: "p-001", name: "p", type: { kind: "named", name: "Point" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "access", id: "acc-001", target: { kind: "ident", id: "id-001", name: "p" }, field: "x" }] },
                ],
            },
        },
        {
            type: "missing_record_fields",
            pipeline_stage: "type_checker",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "recordName", type: "string" },
                { name: "missingFields", type: "string[]" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "record", id: "rec-001", name: "Point", fields: [{ kind: "field", id: "fld-x-004", name: "x", type: { kind: "basic", name: "Int" } }, { kind: "field", id: "fld-y-004", name: "y", type: { kind: "basic", name: "Int" } }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "record_expr", id: "rl-001", name: "Point", fields: [{ kind: "field_init", name: "x", value: { kind: "literal", id: "lit-001", value: 1 } }] }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "record", id: "rec-001", name: "Point", fields: [{ kind: "field", id: "fld-x-005", name: "x", type: { kind: "basic", name: "Int" } }, { kind: "field", id: "fld-y-005", name: "y", type: { kind: "basic", name: "Int" } }] },
                    { kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "named", name: "Point" }, contracts: [], body: [{ kind: "record_expr", id: "rl-001", name: "Point", fields: [{ kind: "field_init", name: "x", value: { kind: "literal", id: "lit-001", value: 1 } }, { kind: "field_init", name: "y", value: { kind: "literal", id: "lit-002", value: 2 } }] }] },
                ],
            },
        },

        // =====================================================================
        // Phase 2c — Complexity checking errors
        // =====================================================================
        {
            type: "function_complexity_exceeded",
            pipeline_stage: "complexity_checker",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "functionName", type: "string" },
                { name: "metric", type: "\"maxAstNodes\" | \"maxCallDepth\" | \"maxBranches\"" },
                { name: "actual", type: "number" },
                { name: "limit", type: "number" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], constraints: { kind: "constraints", maxAstNodes: 2 }, body: [{ kind: "binop", id: "bin-001", op: "+", left: { kind: "literal", id: "lit-1", value: 1 }, right: { kind: "literal", id: "lit-2", value: 2 } }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], constraints: { kind: "constraints", maxAstNodes: 10 }, body: [{ kind: "binop", id: "bin-001", op: "+", left: { kind: "literal", id: "lit-1", value: 1 }, right: { kind: "literal", id: "lit-2", value: 2 } }] }],
            },
        },
        {
            type: "module_complexity_exceeded",
            pipeline_stage: "complexity_checker",
            fields: [
                { name: "metric", type: "\"maxAstNodes\" | \"maxCallDepth\" | \"maxBranches\"" },
                { name: "actual", type: "number" },
                { name: "limit", type: "number" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                budget: { kind: "constraints", maxAstNodes: 2 },
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 1 }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                budget: { kind: "constraints", maxAstNodes: 10 },
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 1 }] }],
            },
        },

        // =====================================================================
        // Phase 3 — Effect checking errors
        // =====================================================================
        {
            type: "effect_violation",
            pipeline_stage: "effect_checker",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "functionName", type: "string" },
                { name: "missingEffects", type: "Effect[]" },
                { name: "callSiteNodeId", type: "string | null" },
                { name: "calleeName", type: "string" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "greet", params: [], effects: ["reads"], returnType: { kind: "basic", name: "String" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-print-001", name: "print" }, args: [{ kind: "literal", id: "lit-001", value: "hi" }] }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "greet", params: [], effects: ["io"], returnType: { kind: "basic", name: "String" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-print-002", name: "print" }, args: [{ kind: "literal", id: "lit-001", value: "hi" }] }] },
                ],
            },
        },
        {
            type: "effect_in_pure",
            pipeline_stage: "effect_checker",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "functionName", type: "string" },
                { name: "callSiteNodeId", type: "string | null" },
                { name: "calleeName", type: "string" },
                { name: "calleeEffects", type: "Effect[]" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "greet", params: [], effects: ["pure"], returnType: { kind: "basic", name: "String" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-print-003", name: "print" }, args: [{ kind: "literal", id: "lit-001", value: "hi" }] }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "greet", params: [], effects: ["io"], returnType: { kind: "basic", name: "String" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-print-004", name: "print" }, args: [{ kind: "literal", id: "lit-001", value: "hi" }] }] },
                ],
            },
        },

        // =====================================================================
        // Phase 4 — Contract verification errors
        // =====================================================================
        {
            type: "contract_failure",
            pipeline_stage: "contract_verifier",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "contractId", type: "string" },
                { name: "functionName", type: "string" },
                { name: "contractKind", type: "\"pre\" | \"post\"" },
                { name: "counterexample", type: "Record<string, unknown>" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "abs", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "post", id: "post-001", condition: { kind: "binop", id: "cmp-001", op: ">", left: { kind: "ident", id: "id-r", name: "result" }, right: { kind: "literal", id: "lit-z", value: 0 } } }], body: [{ kind: "ident", id: "id-001", name: "x" }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "abs", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "post", id: "post-001", condition: { kind: "binop", id: "cmp-001", op: ">=", left: { kind: "ident", id: "id-r", name: "result" }, right: { kind: "literal", id: "lit-z", value: 0 } } }], body: [{ kind: "if", id: "if-001", condition: { kind: "binop", id: "cmp-002", op: ">=", left: { kind: "ident", id: "id-x1", name: "x" }, right: { kind: "literal", id: "lit-001", value: 0 } }, then: [{ kind: "ident", id: "id-x2", name: "x" }], else: [{ kind: "binop", id: "neg-001", op: "*", left: { kind: "literal", id: "lit-m1", value: -1 }, right: { kind: "ident", id: "id-x3", name: "x" } }] }] }],
            },
        },
        {
            type: "verification_timeout",
            pipeline_stage: "contract_verifier",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "contractId", type: "string" },
                { name: "functionName", type: "string" },
                { name: "timeoutMs", type: "number" },
            ],
            // Timeout trigger: use a deeply nested arithmetic expression that's hard for Z3
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "complex", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "post", id: "post-001", condition: { kind: "binop", id: "cmp-t1", op: ">", left: { kind: "binop", id: "mul-t1", op: "*", left: { kind: "ident", id: "id-r-t1", name: "result" }, right: { kind: "ident", id: "id-r-t2", name: "result" } }, right: { kind: "binop", id: "mul-t2", op: "*", left: { kind: "ident", id: "id-r-t3", name: "result" }, right: { kind: "literal", id: "lit-t1", value: -1 } } } }], body: [{ kind: "binop", id: "add-001", op: "+", left: { kind: "ident", id: "id-001", name: "x" }, right: { kind: "literal", id: "lit-002", value: 1 } }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "complex", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "binop", id: "add-001", op: "+", left: { kind: "ident", id: "id-001", name: "x" }, right: { kind: "literal", id: "lit-002", value: 1 } }] }],
            },
        },
        {
            type: "undecidable_predicate",
            pipeline_stage: "contract_verifier",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "contractId", type: "string" },
                { name: "functionName", type: "string" },
                { name: "unsupportedNodeKind", type: "string" },
            ],
            // Undecidable: contract contains a call node which Z3 can't translate
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-helper", name: "helper", params: [{ kind: "param", id: "p-h", name: "n", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-h", name: "n" }] },
                    { kind: "fn", id: "fn-001", name: "f", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "post", id: "post-001", condition: { kind: "binop", id: "cmp-ud", op: ">", left: { kind: "call", id: "call-ud", fn: { kind: "ident", id: "id-hcall", name: "helper" }, args: [{ kind: "ident", id: "id-r", name: "result" }] }, right: { kind: "literal", id: "lit-ud", value: 0 } } }], body: [{ kind: "ident", id: "id-001", name: "x" }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-helper", name: "helper", params: [{ kind: "param", id: "p-h", name: "n", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-h", name: "n" }] },
                    { kind: "fn", id: "fn-001", name: "f", params: [{ kind: "param", id: "p-001", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-001", name: "x" }] },
                ],
            },
        },
        {
            type: "precondition_not_met",
            pipeline_stage: "contract_verifier",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "callSiteId", type: "string" },
                { name: "callerName", type: "string" },
                { name: "calleeName", type: "string" },
                { name: "contractId", type: "string" },
                { name: "counterexample", type: "Record<string, unknown>" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "divide", params: [{ kind: "param", id: "p-001", name: "a", type: { kind: "basic", name: "Int" } }, { kind: "param", id: "p-002", name: "b", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "pre", id: "pre-001", condition: { kind: "binop", id: "cmp-001", op: "!=", left: { kind: "ident", id: "id-b", name: "b" }, right: { kind: "literal", id: "lit-z", value: 0 } } }], body: [{ kind: "binop", id: "div-001", op: "/", left: { kind: "ident", id: "id-a", name: "a" }, right: { kind: "ident", id: "id-b2", name: "b" } }] },
                    { kind: "fn", id: "fn-002", name: "main", params: [{ kind: "param", id: "p-003", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-div-001", name: "divide" }, args: [{ kind: "ident", id: "id-x", name: "x" }, { kind: "literal", id: "lit-001", value: 0 }] }] },
                ],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [
                    { kind: "fn", id: "fn-001", name: "divide", params: [{ kind: "param", id: "p-001", name: "a", type: { kind: "basic", name: "Int" } }, { kind: "param", id: "p-002", name: "b", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "pre", id: "pre-001", condition: { kind: "binop", id: "cmp-001", op: "!=", left: { kind: "ident", id: "id-b", name: "b" }, right: { kind: "literal", id: "lit-z", value: 0 } } }], body: [{ kind: "binop", id: "div-001", op: "/", left: { kind: "ident", id: "id-a", name: "a" }, right: { kind: "ident", id: "id-b2", name: "b" } }] },
                    { kind: "fn", id: "fn-002", name: "main", params: [{ kind: "param", id: "p-003", name: "x", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "call", id: "call-001", fn: { kind: "ident", id: "id-div-002", name: "divide" }, args: [{ kind: "ident", id: "id-x", name: "x" }, { kind: "literal", id: "lit-001", value: 1 }] }] },
                ],
            },
        },

        // =====================================================================
        // Phase 5 — Codegen errors
        // =====================================================================
        {
            type: "wasm_validation_error",
            pipeline_stage: "codegen",
            fields: [
                { name: "message", type: "string" },
            ],
            example_cause: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "bad_codegen", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-001", name: "internal_compiler_error" }] }],
            },
            example_fix: {
                kind: "module",
                name: "test",
                definitions: [{ kind: "fn", id: "fn-001", name: "bad_codegen", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 1 }] }],
            },
        },

        // =====================================================================
        // Patch errors
        // =====================================================================
        {
            type: "patch_node_not_found",
            pipeline_stage: "patch",
            fields: [
                { name: "nodeId", type: "string | null" },
                { name: "patchIndex", type: "number" },
            ],
            example_cause: { patches: [{ nodeId: "nonexistent-001", op: "replace", field: "name", value: "fixed" }] },
            example_fix: { patches: [{ nodeId: "fn-main-001", op: "replace", field: "name", value: "fixed" }] },
        },
        {
            type: "patch_invalid_field",
            pipeline_stage: "patch",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "field", type: "string" },
                { name: "availableFields", type: "string[]" },
                { name: "patchIndex", type: "number" },
            ],
            example_cause: { patches: [{ nodeId: "fn-main-001", op: "replace", field: "nonexistent", value: "x" }] },
            example_fix: { patches: [{ nodeId: "fn-main-001", op: "replace", field: "name", value: "x" }] },
        },
        {
            type: "patch_index_out_of_range",
            pipeline_stage: "patch",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "field", type: "string" },
                { name: "index", type: "number" },
                { name: "arrayLength", type: "number" },
                { name: "patchIndex", type: "number" },
            ],
            example_cause: { patches: [{ nodeId: "fn-main-001", op: "insert", field: "params", index: 999, value: {} }] },
            example_fix: { patches: [{ nodeId: "fn-main-001", op: "insert", field: "params", index: 0, value: {} }] },
        },
        {
            type: "patch_delete_not_in_array",
            pipeline_stage: "patch",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "patchIndex", type: "number" },
            ],
            example_cause: { patches: [{ nodeId: "fn-main-001", op: "delete" }] },
            example_fix: { patches: [{ nodeId: "fn-main-001", op: "replace", field: "name", value: "updated" }] },
        },

        // =====================================================================
        // Lint warnings (non-blocking)
        // =====================================================================
        {
            type: "unused_variable",
            pipeline_stage: "lint",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "name", type: "string" },
            ],
            example_cause: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "let", id: "let-001", name: "unused", type: { kind: "basic", name: "Int" }, value: { kind: "literal", id: "lit-001", value: 42 } }, { kind: "literal", id: "lit-002", value: 0 }] }],
            },
            example_fix: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-002", value: 0 }] }],
            },
        },
        {
            type: "unused_import",
            pipeline_stage: "lint",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "importModule", type: "string" },
                { name: "unusedNames", type: "string[]" },
            ],
            example_cause: {
                kind: "module", id: "mod-001", name: "test", imports: [{ kind: "import", id: "imp-001", module: "std", names: ["map"] }],
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
            example_fix: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "main", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
        },
        {
            type: "missing_contract",
            pipeline_stage: "lint",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "functionName", type: "string" },
            ],
            example_cause: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "add", params: [{ kind: "param", id: "p-001", name: "a", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "ident", id: "id-001", name: "a" }] }],
            },
            example_fix: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "add", params: [{ kind: "param", id: "p-001", name: "a", type: { kind: "basic", name: "Int" } }], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [{ kind: "post", id: "post-001", condition: { kind: "binop", id: "cmp-001", op: ">=", left: { kind: "ident", id: "id-r", name: "result" }, right: { kind: "literal", id: "lit-z", value: 0 } } }], body: [{ kind: "ident", id: "id-001", name: "a" }] }],
            },
        },
        {
            type: "oversized_function",
            pipeline_stage: "lint",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "functionName", type: "string" },
                { name: "expressionCount", type: "number" },
                { name: "threshold", type: "number" },
            ],
            example_cause: { _note: "Function with >50 recursive expression nodes" },
            example_fix: { _note: "Split into smaller helper functions" },
        },
        {
            type: "empty_body",
            pipeline_stage: "lint",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "functionName", type: "string" },
            ],
            example_cause: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "stub", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [] }],
            },
            example_fix: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "stub", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 0 }] }],
            },
        },
        {
            type: "redundant_effect",
            pipeline_stage: "lint",
            fields: [
                { name: "nodeId", type: "string" },
                { name: "functionName", type: "string" },
                { name: "redundantEffects", type: "Effect[]" },
                { name: "requiredEffects", type: "Effect[]" },
                { name: "suggestion", type: "FixSuggestion?" },
            ],
            example_cause: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "helper", params: [], effects: ["io"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 42 }] }],
            },
            example_fix: {
                kind: "module", id: "mod-001", name: "test", imports: [],
                definitions: [{ kind: "fn", id: "fn-001", name: "helper", params: [], effects: ["pure"], returnType: { kind: "basic", name: "Int" }, contracts: [], body: [{ kind: "literal", id: "lit-001", value: 42 }] }],
            },
        },
    ];

    return { count: errors.length, errors };
}
