// =============================================================================
// Multi-Module Pipeline — checkMultiModule(modules) → Promise<MultiModuleCheckResult>
// =============================================================================
// Validates, resolves cross-module imports, detects circular imports, merges
// into a single virtual module, and runs the full single-module pipeline.

import type { EdictModule, Import, Definition } from "./ast/nodes.js";
import type { StructuredError, AnalysisDiagnostic, VerificationCoverage } from "./errors/structured-errors.js";
import type { TypedModuleInfo } from "./checker/check.js";
import { validate } from "./validator/validate.js";
import { check } from "./check.js";
import {
    circularImport,
    unresolvedModule,
    duplicateModuleName,
} from "./errors/structured-errors.js";

import { expandCompact } from "./compact/expand.js";
import { migrateToLatest } from "./migration/migrate.js";

// =============================================================================
// Result type
// =============================================================================

export interface MultiModuleCheckResult {
    ok: boolean;
    errors: StructuredError[];
    /** The merged virtual module (only present when ok === true) */
    mergedModule?: EdictModule;
    /** Side-table of inferred types (only present when ok === true) */
    typeInfo?: TypedModuleInfo;
    /** INFO-level diagnostics (present even when ok === true) */
    diagnostics?: AnalysisDiagnostic[];
    /** Summary of what was verified vs. skipped */
    coverage?: VerificationCoverage;
    /** Topological order of module names */
    moduleOrder?: string[];
}

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Multi-module pipeline: validate each → detect cycles → merge → check merged.
 *
 * @param modules Array of EdictModule ASTs to compile together (can be compact or older schema)
 * @returns The merged module and check results, or structured errors
 */
export async function checkMultiModule(
    modules: unknown[],
): Promise<MultiModuleCheckResult> {
    const errors: StructuredError[] = [];
    const expandedModules: EdictModule[] = [];

    // --- Step 0: Expand compact ASTs and run schema migrations ---
    for (const mod of modules) {
        const expanded = expandCompact(mod);
        const migrated = migrateToLatest(expanded);
        if (!migrated.ok) {
            errors.push(...migrated.errors);
        } else {
            expandedModules.push(migrated.ast as EdictModule);
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // --- Step 1: Validate each module independently ---
    for (const mod of expandedModules) {
        const result = validate(mod);
        if (!result.ok) {
            errors.push(...result.errors);
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // --- Step 2: Build module registry, check for duplicate names ---
    const registry = new Map<string, EdictModule>();
    const nameToIds = new Map<string, string[]>();

    for (const mod of expandedModules) {
        const existing = nameToIds.get(mod.name);
        if (existing) {
            existing.push(mod.id);
        } else {
            nameToIds.set(mod.name, [mod.id]);
        }
        registry.set(mod.name, mod);
    }

    for (const [name, ids] of nameToIds) {
        if (ids.length > 1) {
            errors.push(duplicateModuleName(name, ids));
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // --- Step 3: Build import graph and detect circular imports ---
    const moduleNames = new Set(registry.keys());

    // Validate all cross-module imports resolve to known modules
    for (const mod of expandedModules) {
        for (const imp of mod.imports) {
            // Only check imports that refer to modules in this compilation set
            // External imports (e.g., "std") are preserved as-is
            if (!moduleNames.has(imp.module) && !isExternalModule(imp.module)) {
                errors.push(
                    unresolvedModule(imp.module, imp.id, [...moduleNames]),
                );
            }
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // Topological sort with cycle detection
    const sortResult = topologicalSort(expandedModules, moduleNames);
    if (!sortResult.ok) {
        errors.push(circularImport(sortResult.cycle!));
        return { ok: false, errors };
    }

    const moduleOrder = sortResult.order!;

    // --- Step 4: Merge modules into a single virtual module ---
    const mergedModule = mergeModules(expandedModules, moduleNames, moduleOrder);

    // --- Step 5: Run full pipeline on the merged module ---
    const checkResult = await check(mergedModule);
    if (!checkResult.ok) {
        return { ok: false, errors: checkResult.errors, moduleOrder };
    }

    return {
        ok: true,
        errors: [],
        mergedModule: checkResult.module ?? mergedModule,
        typeInfo: checkResult.typeInfo,
        diagnostics: checkResult.diagnostics,
        coverage: checkResult.coverage,
        moduleOrder,
    };
}

// =============================================================================
// Topological sort with cycle detection
// =============================================================================

interface SortResult {
    ok: boolean;
    order?: string[];
    cycle?: string[];
}

function topologicalSort(
    modules: EdictModule[],
    internalModules: Set<string>,
): SortResult {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];
    const path: string[] = [];

    // Build adjacency: module → modules it depends on (internal only)
    const deps = new Map<string, string[]>();
    for (const mod of modules) {
        const modDeps: string[] = [];
        for (const imp of mod.imports) {
            if (internalModules.has(imp.module)) {
                modDeps.push(imp.module);
            }
        }
        deps.set(mod.name, modDeps);
    }

    function visit(name: string): string[] | null {
        if (visited.has(name)) return null;
        if (visiting.has(name)) {
            // Found a cycle — extract the cycle path
            const cycleStart = path.indexOf(name);
            return [...path.slice(cycleStart), name];
        }

        visiting.add(name);
        path.push(name);

        const moduleDeps = deps.get(name) ?? [];
        for (const dep of moduleDeps) {
            const cycle = visit(dep);
            if (cycle) return cycle;
        }

        path.pop();
        visiting.delete(name);
        visited.add(name);
        order.push(name);
        return null;
    }

    for (const mod of modules) {
        const cycle = visit(mod.name);
        if (cycle) {
            return { ok: false, cycle };
        }
    }

    return { ok: true, order };
}

// =============================================================================
// Module merging
// =============================================================================

/**
 * Merge multiple modules into a single virtual module.
 * - Concatenates all definitions (topological order)
 * - Removes cross-module imports (they become internal references)
 * - Preserves external imports (deduped by module+name)
 */
function mergeModules(
    modules: EdictModule[],
    internalModules: Set<string>,
    order: string[],
): EdictModule {
    const moduleByName = new Map<string, EdictModule>();
    for (const mod of modules) {
        moduleByName.set(mod.name, mod);
    }

    const allDefinitions: Definition[] = [];
    const externalImportKey = (mod: string, name: string) => `${mod}::${name}`;
    const seenExternalImports = new Set<string>();
    const mergedExternalImports = new Map<string, Import>();

    // Process modules in topological order
    for (const name of order) {
        const mod = moduleByName.get(name)!;

        // Collect definitions
        allDefinitions.push(...mod.definitions);

        // Collect external imports (not referencing modules in this set)
        for (const imp of mod.imports) {
            if (!internalModules.has(imp.module)) {
                for (const importName of imp.names) {
                    const key = externalImportKey(imp.module, importName);
                    if (!seenExternalImports.has(key)) {
                        seenExternalImports.add(key);
                        const existing = mergedExternalImports.get(imp.module);
                        if (existing) {
                            existing.names.push(importName);
                            // Merge types if present
                            if (imp.types?.[importName]) {
                                existing.types = existing.types ?? {};
                                existing.types[importName] = imp.types[importName];
                            }
                        } else {
                            const newImp: Import = {
                                kind: "import",
                                id: imp.id,
                                module: imp.module,
                                names: [importName],
                            };
                            if (imp.types?.[importName]) {
                                newImp.types = { [importName]: imp.types[importName] };
                            }
                            mergedExternalImports.set(imp.module, newImp);
                        }
                    }
                }
            }
        }
    }

    return {
        kind: "module",
        id: "mod-merged-001",
        name: "merged",
        imports: [...mergedExternalImports.values()],
        definitions: allDefinitions,
    };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a module name refers to an external module (not in the compilation set).
 * Currently we treat any non-user module name as potentially external.
 * Known external modules: "std" and any dotted names (e.g., "std.math").
 */
function isExternalModule(name: string): boolean {
    // In multi-module compilation, only modules explicitly provided in the
    // array are considered "internal". Everything else would be flagged as
    // unresolved. However, we treat well-known external module prefixes
    // as acceptable — these resolve to WASM host imports at runtime.
    return name === "std" || name.startsWith("std.");
}
