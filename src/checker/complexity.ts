import type { EdictModule, Expression } from "../ast/nodes.js";
import {
    type StructuredError,
    functionComplexityExceeded,
    moduleComplexityExceeded,
} from "../errors/structured-errors.js";
import { walkExpression } from "../ast/walk.js";

/**
 * Validates the AST against token budget and complexity quotas.
 * Used to constrain runaway agents from generating arbitrarily large programs.
 */
export function complexityCheck(module: EdictModule): StructuredError[] {
    const errors: StructuredError[] = [];

    let totalAstNodes = 0;
    let maxModuleCallDepth = 0;
    let totalBranches = 0;

    for (const def of module.definitions) {
        totalAstNodes += 1; // Count the definition node itself

        if (def.kind === "fn") {
            let fnAstNodes = 1; // Function definition
            let fnCallDepth = 0;
            let fnBranches = 0;

            function walk(expr: Expression): void {
                let currentDepth = 0;

                walkExpression(expr, {
                    enter(node) {
                        fnAstNodes += 1;
                        currentDepth += 1;
                        if (currentDepth > fnCallDepth) {
                            fnCallDepth = currentDepth;
                        }

                        if (node.kind === "if") {
                            fnBranches += 1;
                        } else if (node.kind === "match") {
                            // match adds an arm for every arm
                            fnBranches += node.arms.length;
                        } else if (node.kind === "record_expr" || node.kind === "enum_constructor") {
                            // record properties and enum fields count as AST nodes under current logic
                            fnAstNodes += node.fields.length;
                        }
                    },
                    leave(_node) {
                        currentDepth -= 1;
                    }
                });
            }

            for (const e of def.body) {
                walk(e);
            }

            // Check function constraints
            if (def.constraints) {
                if (def.constraints.maxAstNodes !== undefined && fnAstNodes > def.constraints.maxAstNodes) {
                    errors.push(functionComplexityExceeded(def.id, def.name, "maxAstNodes", fnAstNodes, def.constraints.maxAstNodes));
                }
                if (def.constraints.maxCallDepth !== undefined && fnCallDepth > def.constraints.maxCallDepth) {
                    errors.push(functionComplexityExceeded(def.id, def.name, "maxCallDepth", fnCallDepth, def.constraints.maxCallDepth));
                }
                if (def.constraints.maxBranches !== undefined && fnBranches > def.constraints.maxBranches) {
                    errors.push(functionComplexityExceeded(def.id, def.name, "maxBranches", fnBranches, def.constraints.maxBranches));
                }
            }

            totalAstNodes += fnAstNodes;
            maxModuleCallDepth = Math.max(maxModuleCallDepth, fnCallDepth);
            totalBranches += fnBranches;
        } else if (def.kind === "record") {
            totalAstNodes += def.fields.length;
        } else if (def.kind === "enum") {
            totalAstNodes += def.variants.length;
            for (const v of def.variants) {
                totalAstNodes += v.fields.length;
            }
        }
    }

    // Check module budget
    if (module.budget) {
        if (module.budget.maxAstNodes !== undefined && totalAstNodes > module.budget.maxAstNodes) {
            errors.push(moduleComplexityExceeded("maxAstNodes", totalAstNodes, module.budget.maxAstNodes));
        }
        if (module.budget.maxCallDepth !== undefined && maxModuleCallDepth > module.budget.maxCallDepth) {
            errors.push(moduleComplexityExceeded("maxCallDepth", maxModuleCallDepth, module.budget.maxCallDepth));
        }
        if (module.budget.maxBranches !== undefined && totalBranches > module.budget.maxBranches) {
            errors.push(moduleComplexityExceeded("maxBranches", totalBranches, module.budget.maxBranches));
        }
    }

    return errors;
}
