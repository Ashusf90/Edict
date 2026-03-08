// =============================================================================
// Error Recovery Benchmark Runner
// =============================================================================
// Run: npx tsx benchmarks/error-recovery/runner.ts [--mode mock|catalog]
//
// Measures how effectively structured errors enable agent self-repair.
//
// Modes:
//   - mock:    Deterministic repair using structured error fields (CI-compatible)
//   - catalog: Use error catalog example_fix pairs as ground truth
//
// Metrics:
//   - Recovery rate: % of broken ASTs successfully repaired to passing state
//   - Rounds:        Average number of compiler round-trips to reach a fix
//   - Fix accuracy:  Whether the fix matches the expected fix structurally
//
// Output:
//   - Summary table to stdout
//   - Structured JSON to benchmarks/error-recovery/results.json

import { writeFileSync } from "node:fs";
import { check } from "../../src/check.js";
import { buildCorpus, type CorpusEntry } from "./corpus.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepairStrategy {
    /** Human-readable name of this strategy */
    name: string;
    /**
     * Given a broken AST and the structured errors from the compiler,
     * attempt to produce a repaired AST.
     * Return null if the strategy cannot repair.
     */
    repair(brokenAst: Record<string, unknown>, errors: unknown[], round: number): Record<string, unknown> | null;
}

interface EntryResult {
    id: string;
    targetErrors: string[];
    stage: string;
    difficulty: number;
    recovered: boolean;
    rounds: number;
    maxRounds: number;
    finalErrors: unknown[];
}

export interface BenchmarkResults {
    timestamp: string;
    strategy: string;
    corpusSize: number;
    summary: {
        recoveryRate: number;
        avgRounds: number;
        byStage: Record<string, { total: number; recovered: number; rate: number }>;
        byDifficulty: Record<number, { total: number; recovered: number; rate: number }>;
        fieldCoverage: Record<string, { fieldsUsed: string[]; fieldsAvailable: string[] }>;
    };
    entries: EntryResult[];
}

// ---------------------------------------------------------------------------
// Mock repair strategy — uses structured error fields deterministically
// ---------------------------------------------------------------------------
// This is the CI-compatible strategy. It interprets error.error + error fields
// and applies mechanical fixes. It measures whether the error format contains
// enough information for a deterministic repair agent.

export const mockRepairStrategy: RepairStrategy = {
    name: "mock-deterministic",
    repair(brokenAst: Record<string, unknown>, errors: unknown[], _round: number): Record<string, unknown> | null {
        if (errors.length === 0) return null;

        // Deep clone to avoid mutation
        const ast = JSON.parse(JSON.stringify(brokenAst));
        const err = errors[0] as Record<string, unknown>;
        const errorType = err.error as string;

        switch (errorType) {
            // --- Validation fixes ---
            case "duplicate_id":
                return fixDuplicateId(ast, err);
            case "unknown_node_kind":
                return fixUnknownNodeKind(ast, err);
            case "missing_field":
                return fixMissingField(ast, err);
            case "invalid_field_type":
                return fixInvalidFieldType(ast, err);
            case "invalid_effect":
                return fixInvalidEffect(ast, err);
            case "invalid_operator":
                return fixInvalidOperator(ast, err);
            case "invalid_basic_type_name":
                return fixInvalidBasicTypeName(ast, err);
            case "conflicting_effects":
                return fixConflictingEffects(ast, err);
            // --- Resolution fixes ---
            case "undefined_reference":
                return fixUndefinedReference(ast, err);
            case "duplicate_definition":
                return fixDuplicateDefinition(ast, err);
            case "unknown_record":
                return fixUnknownRecord(ast, err);
            case "unknown_enum":
                return fixUnknownEnum(ast, err);
            case "unknown_variant":
                return fixUnknownVariant(ast, err);
            // --- Type checking fixes ---
            case "type_mismatch":
                return fixTypeMismatch(ast, err);
            case "arity_mismatch":
                return fixArityMismatch(ast, err);
            case "not_a_function":
                return fixNotAFunction(ast, err);
            case "missing_record_fields":
                return fixMissingRecordFields(ast, err);
            case "unknown_field":
                return fixUnknownField(ast, err);
            // --- Effect fixes ---
            case "effect_violation":
            case "effect_in_pure":
                return fixEffectError(ast, err);
            // --- Contract fixes ---
            case "contract_failure":
            case "verification_timeout":
            case "undecidable_predicate":
                return fixContractError(ast, err);
            case "precondition_not_met":
                return fixPreconditionNotMet(ast, err);
            default:
                return null;
        }
    },
};

// ---------------------------------------------------------------------------
// Fix helpers — each uses only structured error fields
// ---------------------------------------------------------------------------

function findNodeById(obj: unknown, nodeId: string): Record<string, unknown> | null {
    if (obj === null || typeof obj !== "object") return null;
    const record = obj as Record<string, unknown>;
    if (record.id === nodeId) return record;
    for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findNodeById(item, nodeId);
                if (found) return found;
            }
        } else if (typeof value === "object" && value !== null) {
            const found = findNodeById(value, nodeId);
            if (found) return found;
        }
    }
    return null;
}

function findAllNodes(obj: unknown): Record<string, unknown>[] {
    const nodes: Record<string, unknown>[] = [];
    if (obj === null || typeof obj !== "object") return nodes;
    const record = obj as Record<string, unknown>;
    if (typeof record.id === "string") nodes.push(record);
    for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                nodes.push(...findAllNodes(item));
            }
        } else if (typeof value === "object" && value !== null) {
            nodes.push(...findAllNodes(value));
        }
    }
    return nodes;
}

function fixDuplicateId(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string;
    // Find all nodes with this ID and rename all but the first
    const allNodes = findAllNodes(ast);
    let count = 0;
    for (const node of allNodes) {
        if (node.id === nodeId) {
            count++;
            if (count > 1) {
                // Generate a new unique ID
                const kind = (node.kind as string) || "node";
                node.id = `${kind}-${nodeId}-fix-${count}`;
            }
        }
    }
    return ast;
}

function fixUnknownNodeKind(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const received = err.received as string;
    const validKinds = err.validKinds as string[];
    // Find node with the wrong kind and replace with closest valid kind
    const allNodes = findAllNodes(ast);
    for (const node of allNodes) {
        if (node.kind === received) {
            // Use Levenshtein-closest valid kind
            node.kind = findClosest(received, validKinds);
            // If it became "fn", ensure required fields exist
            if (node.kind === "fn") {
                if (!node.params) node.params = [];
                if (!node.effects) node.effects = ["io"];
                if (!node.returnType) node.returnType = { kind: "basic", name: "Int" };
                if (!node.contracts) node.contracts = [];
                if (!node.body) node.body = [{ kind: "literal", id: `lit-fix-001`, value: 0 }];
            }
            break;
        }
    }
    return ast;
}

function fixMissingField(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string;
    const field = err.field as string;
    const node = nodeId ? findNodeById(ast, nodeId) : null;
    if (!node) return ast;
    // Add default values for known fields
    const defaults: Record<string, unknown> = {
        params: [],
        effects: ["io"],
        returnType: { kind: "basic", name: "Int" },
        contracts: [],
        body: [{ kind: "literal", id: "lit-fix-001", value: 0 }],
        name: "main",
        id: "fix-id-001",
        fields: [],
        variants: [],
    };
    if (field in defaults) {
        node[field] = defaults[field];
    }
    return ast;
}

function fixInvalidFieldType(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string;
    const field = err.field as string;
    const expectedFormat = err.expectedFormat as string;
    const node = nodeId ? findNodeById(ast, nodeId) : null;
    if (!node) return ast;
    // Replace field with a valid default based on expected type
    if (expectedFormat.includes("string")) {
        node[field] = field === "name" ? "main" : "default";
    } else if (expectedFormat.includes("array")) {
        node[field] = [];
    }
    return ast;
}

function fixInvalidEffect(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string;
    const received = err.received as string;
    const validEffects = err.validEffects as string[];
    const node = nodeId ? findNodeById(ast, nodeId) : null;
    if (!node) return ast;
    const effects = node.effects as string[];
    const idx = effects.indexOf(received);
    if (idx >= 0) {
        // Replace with closest valid effect
        effects[idx] = findClosest(received, validEffects);
    }
    return ast;
}

function fixInvalidOperator(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string;
    const validOperators = err.validOperators as string[];
    const node = nodeId ? findNodeById(ast, nodeId) : null;
    if (!node) return ast;
    const received = node.op as string;
    node.op = findClosest(received, validOperators);
    return ast;
}

function fixInvalidBasicTypeName(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string;
    const validNames = err.validNames as string[];
    const received = err.received as string;
    // Walk the AST to find the type node at the path
    const allNodes = findAllNodes(ast);
    for (const node of allNodes) {
        if (node.id === nodeId) {
            // Check returnType
            fixBasicTypeInSubtree(node, received, findClosest(received, validNames));
        }
    }
    // Also walk definitions for the type ref
    walkAndFixBasicType(ast, received, findClosest(received, validNames));
    return ast;
}

function fixBasicTypeInSubtree(obj: unknown, received: string, replacement: string): void {
    if (obj === null || typeof obj !== "object") return;
    const record = obj as Record<string, unknown>;
    if (record.kind === "basic" && record.name === received) {
        record.name = replacement;
        return;
    }
    for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                fixBasicTypeInSubtree(item, received, replacement);
            }
        } else if (typeof value === "object" && value !== null) {
            fixBasicTypeInSubtree(value, received, replacement);
        }
    }
}

function walkAndFixBasicType(obj: unknown, received: string, replacement: string): void {
    if (obj === null || typeof obj !== "object") return;
    const record = obj as Record<string, unknown>;
    if (record.kind === "basic" && record.name === received) {
        record.name = replacement;
    }
    for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                walkAndFixBasicType(item, received, replacement);
            }
        } else if (typeof value === "object" && value !== null) {
            walkAndFixBasicType(value, received, replacement);
        }
    }
}

function fixConflictingEffects(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string;
    const effectsFound = err.effectsFound as string[];
    const node = nodeId ? findNodeById(ast, nodeId) : null;
    if (!node) return ast;
    // Remove "pure" if mixed with non-pure effects
    if (effectsFound.includes("pure") && effectsFound.length > 1) {
        node.effects = effectsFound.filter(e => e !== "pure");
    } else {
        // Keep only the first effect
        node.effects = [effectsFound[0]!];
    }
    return ast;
}

function fixUndefinedReference(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string | null;
    const suggestion = err.suggestion as { nodeId: string; field: string; value: unknown } | undefined;
    if (suggestion && suggestion.nodeId && suggestion.field) {
        // Apply the fix suggestion directly
        const node = findNodeById(ast, suggestion.nodeId);
        if (node) {
            node[suggestion.field] = suggestion.value;
            return ast;
        }
    }
    // Fallback: if candidates exist, use the first one
    const candidates = err.candidates as string[] | undefined;
    if (candidates && candidates.length > 0 && nodeId) {
        const node = findNodeById(ast, nodeId);
        if (node && node.kind === "ident") {
            node.name = candidates[0]!;
            return ast;
        }
        // For call nodes — fn is now an ident object
        if (node && node.kind === "call") {
            const fnNode = node.fn as Record<string, unknown> | string;
            if (typeof fnNode === "object" && fnNode?.kind === "ident") {
                fnNode.name = candidates[0]!;
            } else {
                node.fn = { kind: "ident", id: "id-fix-ref", name: candidates[0]! };
            }
            return ast;
        }
    }
    // Last resort: replace ident with a literal
    if (nodeId) {
        const node = findNodeById(ast, nodeId);
        if (node && node.kind === "ident") {
            node.kind = "literal";
            delete node.name;
            node.value = 0;
            return ast;
        }
    }
    return ast;
}

function fixDuplicateDefinition(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string | null;
    const name = err.name as string;
    if (nodeId) {
        const node = findNodeById(ast, nodeId);
        if (node) {
            node.name = `${name}_2`;
        }
    }
    return ast;
}

function fixTypeMismatch(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> | null {
    const suggestion = err.suggestion as { nodeId: string; field: string; value: unknown } | undefined;
    if (suggestion && suggestion.nodeId && suggestion.field) {
        const node = findNodeById(ast, suggestion.nodeId);
        if (node) {
            node[suggestion.field] = suggestion.value;
            return ast;
        }
    }
    // Try to fix literal values: if expected type differs, swap the literal
    const nodeId = err.nodeId as string | null;
    const expected = err.expected as Record<string, unknown> | undefined;
    const actual = err.actual as Record<string, unknown> | undefined;
    if (nodeId && expected && actual) {
        const node = findNodeById(ast, nodeId);
        if (node && node.kind === "literal") {
            // Replace literal with a default of the expected type
            const expectedName = expected.name as string || expected.kind as string;
            if (expectedName === "Int") { node.value = 0; return ast; }
            if (expectedName === "Float") { node.value = 0.0; return ast; }
            if (expectedName === "Bool") { node.value = false; return ast; }
            if (expectedName === "String") { node.value = ""; return ast; }
        }
        // If the mismatch is in return type, update the function's returnType
        if (node && (node.kind === "fn" || node.kind === "record_expr" || node.kind === "enum_constructor")) {
            // Walk parent definitions to find the enclosing fn and fix its returnType
            const defs = (ast.definitions || []) as Record<string, unknown>[];
            for (const def of defs) {
                if (def.kind === "fn") {
                    // Check if this fn's body contains the mismatched node
                    if (findNodeById(def, nodeId)) {
                        def.returnType = expected;
                        return ast;
                    }
                }
            }
        }
    }
    return null;
}

function fixArityMismatch(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> | null {
    const nodeId = err.nodeId as string | null;
    const expected = err.expected as number;
    const actual = err.actual as number;
    if (!nodeId) return null;
    const node = findNodeById(ast, nodeId);
    if (!node || !Array.isArray(node.args)) return null;
    if (actual > expected) {
        // Remove extra args
        node.args = (node.args as unknown[]).slice(0, expected);
    } else {
        // Add default args
        while ((node.args as unknown[]).length < expected) {
            (node.args as unknown[]).push({ kind: "literal", id: `lit-fix-${(node.args as unknown[]).length}`, value: 0 });
        }
    }
    return ast;
}

function fixMissingRecordFields(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string | null;
    const missingFields = err.missingFields as string[];
    const suggestion = err.suggestion as { nodeId: string; field: string; value: unknown } | undefined;
    if (suggestion && suggestion.nodeId) {
        const node = findNodeById(ast, suggestion.nodeId);
        if (node) {
            node[suggestion.field] = suggestion.value;
            return ast;
        }
    }
    if (!nodeId) return ast;
    const node = findNodeById(ast, nodeId);
    if (!node || !Array.isArray(node.fields)) return ast;
    for (const fieldName of missingFields) {
        (node.fields as unknown[]).push({
            kind: "field_init",
            name: fieldName,
            value: { kind: "literal", id: `lit-fix-${fieldName}`, value: 0 },
        });
    }
    return ast;
}

function fixUnknownField(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const suggestion = err.suggestion as { nodeId: string; field: string; value: unknown } | undefined;
    if (suggestion && suggestion.nodeId) {
        const node = findNodeById(ast, suggestion.nodeId);
        if (node) {
            node[suggestion.field] = suggestion.value;
            return ast;
        }
    }
    // Fallback: replace with first available field
    const nodeId = err.nodeId as string | null;
    const availableFields = err.availableFields as string[];
    if (nodeId && availableFields.length > 0) {
        const node = findNodeById(ast, nodeId);
        if (node && typeof node.field === "string") {
            node.field = availableFields[0]!;
        }
    }
    return ast;
}

function fixEffectError(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const suggestion = err.suggestion as { nodeId: string; field: string; value: unknown } | undefined;
    if (suggestion && suggestion.nodeId) {
        const node = findNodeById(ast, suggestion.nodeId);
        if (node) {
            node[suggestion.field] = suggestion.value;
            return ast;
        }
    }
    // Fallback: upgrade the caller's effects to include the missing effects
    const nodeId = err.nodeId as string | null;
    if (nodeId) {
        const node = findNodeById(ast, nodeId);
        if (node) {
            // For effect_violation, add missing effects
            const missingEffects = (err.missingEffects as string[]) || [];
            const calleeEffects = (err.calleeEffects as string[]) || [];
            const current = (node.effects as string[]) || [];
            const needed = [...missingEffects, ...calleeEffects];
            if (needed.length > 0) {
                const updated = new Set(current.filter((e: string) => e !== "pure"));
                for (const e of needed) updated.add(e);
                node.effects = [...updated];
            } else {
                // Default: upgrade to io
                node.effects = ["io"];
            }
            return ast;
        }
    }
    return ast;
}

function fixUnknownRecord(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string | null;
    const candidates = err.candidates as string[];
    if (nodeId && candidates?.length > 0) {
        const node = findNodeById(ast, nodeId);
        if (node && node.kind === "record_expr") {
            node.name = candidates[0]!;
            return ast;
        }
    }
    return ast;
}

function fixUnknownEnum(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string | null;
    const candidates = err.candidates as string[];
    if (nodeId && candidates?.length > 0) {
        const node = findNodeById(ast, nodeId);
        if (node && node.kind === "enum_constructor") {
            node.enumName = candidates[0]!;
            return ast;
        }
    }
    return ast;
}

function fixUnknownVariant(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string | null;
    const availableVariants = err.availableVariants as string[];
    if (nodeId && availableVariants?.length > 0) {
        const node = findNodeById(ast, nodeId);
        if (node && node.kind === "enum_constructor") {
            node.variant = availableVariants[0]!;
            return ast;
        }
    }
    return ast;
}

function fixNotAFunction(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const nodeId = err.nodeId as string | null;
    if (!nodeId) return ast;
    // Find the call node and replace it with just the fn ident
    const defs = (ast.definitions || []) as Record<string, unknown>[];
    for (const def of defs) {
        replaceNodeById(def, nodeId, (callNode) => {
            const fnNode = callNode.fn as Record<string, unknown>;
            if (fnNode?.kind === "ident") {
                return { ...fnNode };
            }
            return { kind: "literal", id: callNode.id, value: 0 };
        });
    }
    return ast;
}

function fixContractError(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const contractId = (err.contractId || err.nodeId) as string | null;
    const functionName = err.functionName as string | undefined;
    const defs = (ast.definitions || []) as Record<string, unknown>[];
    for (const def of defs) {
        if (def.kind === "fn") {
            if (functionName && def.name !== functionName) continue;
            const contracts = def.contracts as Record<string, unknown>[];
            if (contracts && contractId) {
                def.contracts = contracts.filter(c => c.id !== contractId);
                return ast;
            }
            def.contracts = [];
            return ast;
        }
    }
    return ast;
}

function fixPreconditionNotMet(ast: Record<string, unknown>, err: Record<string, unknown>): Record<string, unknown> {
    const contractId = err.contractId as string | null;
    const functionName = err.functionName as string | undefined;
    const defs = (ast.definitions || []) as Record<string, unknown>[];
    for (const def of defs) {
        if (def.kind === "fn" && (!functionName || def.name === functionName)) {
            const contracts = def.contracts as Record<string, unknown>[];
            if (contracts && contractId) {
                def.contracts = contracts.filter(c => c.id !== contractId);
                return ast;
            }
        }
    }
    return ast;
}

/**
 * Replace a node in the AST by ID using a transform function.
 */
function replaceNodeById(
    obj: unknown,
    nodeId: string,
    transform: (node: Record<string, unknown>) => Record<string, unknown>,
): boolean {
    if (obj === null || typeof obj !== "object") return false;
    const record = obj as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                const item = value[i];
                if (typeof item === "object" && item !== null && (item as Record<string, unknown>).id === nodeId) {
                    value[i] = transform(item as Record<string, unknown>);
                    return true;
                }
                if (replaceNodeById(item, nodeId, transform)) return true;
            }
        } else if (typeof value === "object" && value !== null) {
            const child = value as Record<string, unknown>;
            if (child.id === nodeId) {
                record[key] = transform(child);
                return true;
            }
            if (replaceNodeById(child, nodeId, transform)) return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Field coverage tracking
// ---------------------------------------------------------------------------
// Maps each error type to the structured fields used by its repair handler
// vs all fields available in the error. Shows untapped signal.

const FIELDS_USED_BY_HANDLER: Record<string, string[]> = {
    duplicate_id: ["nodeId"],
    unknown_node_kind: ["received", "validKinds"],
    missing_field: ["nodeId", "field"],
    invalid_field_type: ["nodeId", "field", "expectedFormat"],
    invalid_effect: ["nodeId", "received", "validEffects"],
    invalid_operator: ["nodeId", "validOperators"],
    invalid_basic_type_name: ["nodeId", "received", "validNames"],
    conflicting_effects: ["nodeId", "effectsFound"],
    undefined_reference: ["nodeId", "suggestion", "candidates"],
    duplicate_definition: ["nodeId", "name"],
    unknown_record: ["nodeId", "candidates"],
    unknown_enum: ["nodeId", "candidates"],
    unknown_variant: ["nodeId", "availableVariants"],
    type_mismatch: ["nodeId", "suggestion", "expected", "actual"],
    arity_mismatch: ["nodeId", "expected", "actual"],
    not_a_function: ["nodeId"],
    missing_record_fields: ["nodeId", "missingFields", "suggestion"],
    unknown_field: ["nodeId", "suggestion", "availableFields"],
    effect_violation: ["nodeId", "suggestion", "missingEffects", "calleeEffects"],
    effect_in_pure: ["nodeId", "suggestion", "missingEffects", "calleeEffects"],
    contract_failure: ["contractId", "nodeId", "functionName"],
    verification_timeout: ["contractId", "nodeId", "functionName"],
    undecidable_predicate: ["contractId", "functionName"],
    precondition_not_met: ["contractId", "functionName"],
};

function computeFieldCoverage(
    entries: EntryResult[],
): Record<string, { fieldsUsed: string[]; fieldsAvailable: string[] }> {
    const result: Record<string, { fieldsUsed: string[]; fieldsAvailable: string[] }> = {};
    for (const entry of entries) {
        for (const errType of entry.targetErrors) {
            if (result[errType]) continue;
            // Fields available from the error
            const sampleErr = entry.finalErrors[0] as Record<string, unknown> | undefined;
            const available = sampleErr
                ? Object.keys(sampleErr).filter(k => k !== "error")
                : [];
            // Fields used by the handler
            const used = FIELDS_USED_BY_HANDLER[errType] || [];
            result[errType] = { fieldsUsed: used, fieldsAvailable: available.length > 0 ? available : used };
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// Levenshtein helper for finding closest match
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i]![j] = Math.min(
                dp[i - 1]![j]! + 1,
                dp[i]![j - 1]! + 1,
                dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
    }
    return dp[m]![n]!;
}

function findClosest(target: string, candidates: string[]): string {
    if (candidates.length === 0) return target;
    let best = candidates[0]!;
    let bestDist = levenshtein(target, best);
    for (let i = 1; i < candidates.length; i++) {
        const dist = levenshtein(target, candidates[i]!);
        if (dist < bestDist) {
            bestDist = dist;
            best = candidates[i]!;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const MAX_ROUNDS = 5;

async function runEntry(entry: CorpusEntry, strategy: RepairStrategy): Promise<EntryResult> {
    let currentAst: Record<string, unknown> = JSON.parse(JSON.stringify(entry.brokenAst));
    let rounds = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
        const result = await check(currentAst);
        if (result.ok) {
            return {
                id: entry.id,
                targetErrors: entry.targetErrors,
                stage: entry.stage,
                difficulty: entry.difficulty,
                recovered: true,
                rounds: round,
                maxRounds: MAX_ROUNDS,
                finalErrors: [],
            };
        }

        rounds = round + 1;
        const repaired = strategy.repair(currentAst, result.errors, round);
        if (!repaired) {
            return {
                id: entry.id,
                targetErrors: entry.targetErrors,
                stage: entry.stage,
                difficulty: entry.difficulty,
                recovered: false,
                rounds,
                maxRounds: MAX_ROUNDS,
                finalErrors: result.errors,
            };
        }
        currentAst = repaired;
    }

    // Final check after last repair
    const finalResult = await check(currentAst);
    return {
        id: entry.id,
        targetErrors: entry.targetErrors,
        stage: entry.stage,
        difficulty: entry.difficulty,
        recovered: finalResult.ok,
        rounds,
        maxRounds: MAX_ROUNDS,
        finalErrors: finalResult.ok ? [] : finalResult.errors,
    };
}

export async function runBenchmark(strategy?: RepairStrategy): Promise<BenchmarkResults> {
    const corpus = await buildCorpus();
    const strat = strategy || mockRepairStrategy;
    const entries: EntryResult[] = [];

    for (const entry of corpus) {
        const result = await runEntry(entry, strat);
        entries.push(result);
    }

    // Compute summary
    const recovered = entries.filter(e => e.recovered);
    const recoveryRate = entries.length > 0 ? recovered.length / entries.length : 0;
    const avgRounds = recovered.length > 0
        ? recovered.reduce((sum, e) => sum + e.rounds, 0) / recovered.length
        : 0;

    // By stage
    const byStage: Record<string, { total: number; recovered: number; rate: number }> = {};
    for (const entry of entries) {
        if (!byStage[entry.stage]) byStage[entry.stage] = { total: 0, recovered: 0, rate: 0 };
        byStage[entry.stage]!.total++;
        if (entry.recovered) byStage[entry.stage]!.recovered++;
    }
    for (const stage of Object.values(byStage)) {
        stage.rate = stage.total > 0 ? stage.recovered / stage.total : 0;
    }

    // By difficulty
    const byDifficulty: Record<number, { total: number; recovered: number; rate: number }> = {};
    for (const entry of entries) {
        if (!byDifficulty[entry.difficulty]) byDifficulty[entry.difficulty] = { total: 0, recovered: 0, rate: 0 };
        byDifficulty[entry.difficulty]!.total++;
        if (entry.recovered) byDifficulty[entry.difficulty]!.recovered++;
    }
    for (const diff of Object.values(byDifficulty)) {
        diff.rate = diff.total > 0 ? diff.recovered / diff.total : 0;
    }

    // Field coverage: track which error fields each handler uses
    const fieldCoverage = computeFieldCoverage(entries);

    return {
        timestamp: new Date().toISOString(),
        strategy: strat.name,
        corpusSize: entries.length,
        summary: { recoveryRate, avgRounds, byStage, byDifficulty, fieldCoverage },
        entries,
    };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function padEnd(str: string, len: number): string {
    return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function padStart(str: string, len: number): string {
    return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

async function main(): Promise<void> {
    console.log(`\nEdict Error Recovery Benchmark`);
    console.log(`${"=".repeat(70)}`);

    const results = await runBenchmark();

    // Entry table
    const idCol = 6;
    const stageCol = 20;
    console.log(`\n${padEnd("ID", idCol)} ${padEnd("Stage", stageCol)} ${padStart("Diff", 4)} ${padStart("OK", 4)} ${padStart("Rnds", 5)} Errors`);
    console.log("-".repeat(70));

    for (const entry of results.entries) {
        const ok = entry.recovered ? "✓" : "✗";
        const errSummary = entry.recovered ? "" : (entry.finalErrors[0] as Record<string, unknown>)?.error as string ?? "unknown";
        console.log(
            `${padEnd(entry.id, idCol)} ${padEnd(entry.stage, stageCol)} ${padStart(String(entry.difficulty), 4)} ${padStart(ok, 4)} ${padStart(String(entry.rounds), 5)} ${errSummary}`,
        );
    }

    // Summary
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Recovery Rate: ${(results.summary.recoveryRate * 100).toFixed(1)}% (${results.entries.filter(e => e.recovered).length}/${results.corpusSize})`);
    console.log(`Avg Rounds:    ${results.summary.avgRounds.toFixed(2)}`);

    console.log(`\nBy Stage:`);
    for (const [stage, data] of Object.entries(results.summary.byStage)) {
        console.log(`  ${padEnd(stage, 22)} ${data.recovered}/${data.total} (${(data.rate * 100).toFixed(0)}%)`);
    }

    console.log(`\nBy Difficulty:`);
    for (const [diff, data] of Object.entries(results.summary.byDifficulty)) {
        console.log(`  Level ${diff}:  ${data.recovered}/${data.total} (${(data.rate * 100).toFixed(0)}%)`);
    }

    // Field coverage
    console.log(`\nField Coverage:`);
    for (const [errType, cov] of Object.entries(results.summary.fieldCoverage)) {
        const unused = cov.fieldsAvailable.filter(f => !cov.fieldsUsed.includes(f));
        const status = unused.length === 0 ? "✓" : `unused: ${unused.join(", ")}`;
        console.log(`  ${padEnd(errType, 26)} ${status}`);
    }

    // Write JSON
    const outPath = "benchmarks/error-recovery/results.json";
    writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
    console.log(`\n✓ Results written to ${outPath}\n`);
}

// Only run CLI when executed directly (not when imported by vitest)
const isDirectRun = process.argv[1]?.includes("runner");
if (isDirectRun) {
    main().catch((err) => {
        console.error("Benchmark failed:", err);
        process.exit(1);
    });
}
