// =============================================================================
// Edict Fragment Composition Engine
// =============================================================================
// compose(fragments) → EdictModule | StructuredError[]
//
// Takes an array of validated fragments and merges them into a single module.
// Checks: duplicate provisions, unsatisfied requirements, import dedup.

import type { EdictModule, EdictFragment, Import } from "../ast/nodes.js";
import type { StructuredError } from "../errors/structured-errors.js";
import {
    unsatisfiedRequirement,
    duplicateProvision,
} from "../errors/structured-errors.js";
import { validate } from "../validator/validate.js";

// =============================================================================
// Result type
// =============================================================================

export type ComposeResult =
    | { ok: true; module: EdictModule }
    | { ok: false; errors: StructuredError[] };

// =============================================================================
// Compose
// =============================================================================

/**
 * Compose an array of fragments into a single EdictModule.
 *
 * 1. Validates each fragment independently
 * 2. Checks for duplicate provisions across fragments
 * 3. Checks that all requirements are satisfied
 * 4. Merges imports (deduped by module+name)
 * 5. Concatenates definitions
 */
export function compose(
    fragments: EdictFragment[],
    moduleName: string = "composed",
    moduleId: string = "mod-composed-001",
): ComposeResult {
    const errors: StructuredError[] = [];

    // --- Step 1: Validate each fragment independently ---
    for (const frag of fragments) {
        const result = validate(frag);
        if (!result.ok) {
            errors.push(...result.errors);
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // --- Step 2: Check for duplicate provisions ---
    const provisionMap = new Map<string, string[]>(); // name → fragmentIds
    for (const frag of fragments) {
        for (const name of frag.provides) {
            const existing = provisionMap.get(name);
            if (existing) {
                existing.push(frag.id);
            } else {
                provisionMap.set(name, [frag.id]);
            }
        }
    }

    for (const [name, fragIds] of provisionMap) {
        if (fragIds.length > 1) {
            errors.push(duplicateProvision(name, fragIds));
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // --- Step 3: Check all requirements are satisfied ---
    const allProvisions = new Set(provisionMap.keys());
    for (const frag of fragments) {
        for (const req of frag.requires) {
            if (!allProvisions.has(req)) {
                errors.push(
                    unsatisfiedRequirement(
                        frag.id,
                        req,
                        [...allProvisions],
                    ),
                );
            }
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // --- Step 4: Merge imports (dedup by module+name) ---
    const importKey = (mod: string, name: string) => `${mod}::${name}`;
    const seenImports = new Set<string>();
    const mergedImportMap = new Map<string, Import>();

    for (const frag of fragments) {
        for (const imp of frag.imports) {
            // Dedup individual names within the same module
            const newNames: string[] = [];
            for (const name of imp.names) {
                const key = importKey(imp.module, name);
                if (!seenImports.has(key)) {
                    seenImports.add(key);
                    newNames.push(name);
                }
            }

            if (newNames.length > 0) {
                const existing = mergedImportMap.get(imp.module);
                if (existing) {
                    existing.names.push(...newNames);
                } else {
                    mergedImportMap.set(imp.module, {
                        kind: "import",
                        id: imp.id,
                        module: imp.module,
                        names: [...newNames],
                    });
                }
            }
        }
    }

    const mergedImports = [...mergedImportMap.values()];

    // --- Step 5: Concatenate definitions ---
    const allDefinitions = fragments.flatMap((f) => f.definitions);

    // --- Step 6: Build the composed module ---
    const module: EdictModule = {
        kind: "module",
        id: moduleId,
        name: moduleName,
        imports: mergedImports,
        definitions: allDefinitions,
    };

    return { ok: true, module };
}
