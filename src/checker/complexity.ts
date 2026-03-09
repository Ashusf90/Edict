import type { EdictModule, Expression } from "../ast/nodes.js";
import {
    type StructuredError,
    functionComplexityExceeded,
    moduleComplexityExceeded,
} from "../errors/structured-errors.js";

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

            function walk(expr: Expression, currentDepth: number): void {
                fnAstNodes += 1;
                
                if (currentDepth > fnCallDepth) {
                    fnCallDepth = currentDepth;
                }

                const nextDepth = currentDepth + 1;

                switch (expr.kind) {
                    case "literal":
                    case "ident":
                        break;
                    case "binop":
                        walk(expr.left, nextDepth);
                        walk(expr.right, nextDepth);
                        break;
                    case "unop":
                        walk(expr.operand, nextDepth);
                        break;
                    case "call":
                        walk(expr.fn, nextDepth);
                        for (const arg of expr.args) walk(arg, nextDepth);
                        break;
                    case "if":
                        fnBranches += 1; // The split is a branch
                        walk(expr.condition, nextDepth);
                        for (const e of expr.then) walk(e, nextDepth);
                        if (expr.else) {
                            for (const e of expr.else) walk(e, nextDepth);
                        }
                        break;
                    case "let":
                        walk(expr.value, nextDepth);
                        break;
                    case "match":
                        walk(expr.target, nextDepth);
                        for (const arm of expr.arms) {
                            fnBranches += 1; // Each pattern arm is a branch
                            for (const e of arm.body) walk(e, nextDepth);
                        }
                        break;
                    case "array":
                    case "tuple_expr":
                        for (const e of expr.elements) walk(e, nextDepth);
                        break;
                    case "record_expr":
                    case "enum_constructor":
                        for (const field of expr.fields) {
                            fnAstNodes += 1; // The field_init node
                            walk(field.value, nextDepth);
                        }
                        break;
                    case "access":
                        walk(expr.target, nextDepth);
                        break;
                    case "lambda":
                        for (const e of expr.body) walk(e, nextDepth);
                        break;
                    case "block":
                        for (const e of expr.body) walk(e, nextDepth);
                        break;
                    case "string_interp":
                        for (const part of expr.parts) walk(part, nextDepth);
                        break;
                    case "forall":
                    case "exists":
                        walk(expr.range.from, nextDepth);
                        walk(expr.range.to, nextDepth);
                        walk(expr.body, nextDepth);
                        break;
                }
            }

            for (const e of def.body) {
                walk(e, 1);
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
