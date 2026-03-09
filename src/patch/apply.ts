// =============================================================================
// AST Patch Engine — applyPatches(ast, patches) → PatchApplyResult
// =============================================================================
// Applies surgical patches to an Edict AST by nodeId.
// Deep-clones the AST before mutation to avoid side effects.

import type { StructuredError } from "../errors/structured-errors.js";
import {
    patchNodeNotFound,
    patchInvalidField,
    patchIndexOutOfRange,
    patchDeleteNotInArray,
} from "../errors/structured-errors.js";

// =============================================================================
// Types
// =============================================================================

export interface AstPatch {
    nodeId: string;
    op: "replace" | "delete" | "insert";
    field?: string;
    value?: unknown;
    index?: number;
}

export interface PatchApplyResult {
    ok: boolean;
    ast?: unknown;
    errors: StructuredError[];
}

interface NodeEntry {
    node: Record<string, unknown>;
    parent: Record<string, unknown> | null;
    parentKey: string | null;
    arrayIndex: number | null;  // index within parent array, if in an array
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Apply surgical patches to an Edict AST by nodeId.
 *
 * Deep-clones the AST before mutation to avoid side effects.
 * Supports `replace`, `delete`, and `insert` operations on any node
 * identified by its unique `id` field.
 *
 * @param ast - The original Edict AST (will not be mutated)
 * @param patches - Array of patch operations to apply sequentially
 * @returns `{ ok: true, ast }` with the patched clone, or `{ ok: false, errors }` if any patch fails
 */
export function applyPatches(ast: unknown, patches: AstPatch[]): PatchApplyResult {
    // Deep clone to avoid mutation of the original
    const cloned = JSON.parse(JSON.stringify(ast)) as unknown;

    // Build node index
    const index = buildNodeIndex(cloned);

    const errors: StructuredError[] = [];

    for (let i = 0; i < patches.length; i++) {
        const patch = patches[i]!;
        const err = applySinglePatch(index, patch, i);
        if (err) {
            errors.push(err);
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return { ok: true, ast: cloned, errors: [] };
}

// =============================================================================
// Single patch application
// =============================================================================

function applySinglePatch(
    index: Map<string, NodeEntry>,
    patch: AstPatch,
    patchIndex: number,
): StructuredError | null {
    const entry = index.get(patch.nodeId);
    if (!entry) {
        return patchNodeNotFound(patch.nodeId, patchIndex);
    }

    switch (patch.op) {
        case "replace":
            return applyReplace(entry, patch, patchIndex);
        case "delete":
            return applyDelete(entry, patch, patchIndex, index);
        case "insert":
            return applyInsert(entry, patch, patchIndex, index);
        default:
            return null;
    }
}

function applyReplace(
    entry: NodeEntry,
    patch: AstPatch,
    patchIndex: number,
): StructuredError | null {
    if (!patch.field) {
        return patchInvalidField(patch.nodeId, "", Object.keys(entry.node), patchIndex);
    }

    if (!(patch.field in entry.node)) {
        return patchInvalidField(
            patch.nodeId,
            patch.field,
            Object.keys(entry.node),
            patchIndex,
        );
    }

    entry.node[patch.field] = patch.value;
    return null;
}

function applyDelete(
    entry: NodeEntry,
    patch: AstPatch,
    patchIndex: number,
    index: Map<string, NodeEntry>,
): StructuredError | null {
    // The node must be inside a parent array
    if (!entry.parent || entry.parentKey === null || entry.arrayIndex === null) {
        return patchDeleteNotInArray(patch.nodeId, patchIndex);
    }

    const parentArray = entry.parent[entry.parentKey];
    if (!Array.isArray(parentArray)) {
        return patchDeleteNotInArray(patch.nodeId, patchIndex);
    }

    // Remove the node from the parent array
    parentArray.splice(entry.arrayIndex, 1);

    // Remove deleted node from index
    index.delete(patch.nodeId);

    // Update arrayIndex of subsequent siblings so future patches find them correctly
    for (let i = entry.arrayIndex; i < parentArray.length; i++) {
        const sibling = parentArray[i] as Record<string, unknown> | undefined;
        if (sibling && typeof sibling === "object" && "id" in sibling && typeof sibling.id === "string") {
            const siblingEntry = index.get(sibling.id);
            if (siblingEntry) {
                siblingEntry.arrayIndex = i;
            }
        }
    }

    return null;
}

function applyInsert(
    entry: NodeEntry,
    patch: AstPatch,
    patchIndex: number,
    index: Map<string, NodeEntry>,
): StructuredError | null {
    if (!patch.field) {
        return patchInvalidField(patch.nodeId, "", Object.keys(entry.node), patchIndex);
    }

    if (!(patch.field in entry.node)) {
        return patchInvalidField(
            patch.nodeId,
            patch.field,
            Object.keys(entry.node),
            patchIndex,
        );
    }

    const targetArray = entry.node[patch.field];
    if (!Array.isArray(targetArray)) {
        return patchInvalidField(
            patch.nodeId,
            patch.field,
            Object.keys(entry.node).filter(k => Array.isArray(entry.node[k])),
            patchIndex,
        );
    }

    const insertIndex = patch.index ?? targetArray.length;
    if (insertIndex < 0 || insertIndex > targetArray.length) {
        return patchIndexOutOfRange(
            patch.nodeId,
            patch.field,
            insertIndex,
            targetArray.length,
            patchIndex,
        );
    }

    targetArray.splice(insertIndex, 0, patch.value);

    // Index the newly inserted node if it has an id
    const inserted = patch.value as Record<string, unknown> | null;
    if (inserted && typeof inserted === "object" && "id" in inserted && typeof inserted.id === "string") {
        index.set(inserted.id, {
            node: inserted,
            parent: entry.node,
            parentKey: patch.field,
            arrayIndex: insertIndex,
        });
    }

    return null;
}

// =============================================================================
// Node index builder — DFS over the AST
// =============================================================================

function buildNodeIndex(ast: unknown): Map<string, NodeEntry> {
    const index = new Map<string, NodeEntry>();
    indexNode(ast, null, null, null, index);
    return index;
}

function indexNode(
    node: unknown,
    parent: Record<string, unknown> | null,
    parentKey: string | null,
    arrayIndex: number | null,
    index: Map<string, NodeEntry>,
): void {
    if (node === null || node === undefined || typeof node !== "object") {
        return;
    }

    if (Array.isArray(node)) {
        return; // Arrays are iterated by their parent
    }

    const obj = node as Record<string, unknown>;

    // Register this node if it has an "id" field
    if ("id" in obj && typeof obj.id === "string") {
        index.set(obj.id, { node: obj, parent, parentKey, arrayIndex });
    }

    // Recurse into all fields
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                indexNode(val[i], obj, key, i, index);
            }
        } else if (val !== null && typeof val === "object") {
            indexNode(val, obj, key, null, index);
        }
    }
}
