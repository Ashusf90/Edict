import type { Expression } from "./nodes.js";

export interface AstVisitor {
    /** 
     * Called before a node's children are visited.
     * Return `false` to prevent the walker from recursing into this node's children.
     */
    enter?: (node: Expression) => void | false;
    
    /** 
     * Called after a node's children have been visited.
     */
    leave?: (node: Expression) => void;
}

/**
 * Recursively walks an Edict expression tree.
 * Guarantees traversal over all child expressions.
 */
export function walkExpression(expr: Expression, visitor: AstVisitor | ((node: Expression) => void)): void {
    let enter: ((node: Expression) => void | false) | undefined;
    let leave: ((node: Expression) => void) | undefined;

    if (typeof visitor === "function") {
        enter = visitor;
    } else {
        enter = visitor.enter;
        leave = visitor.leave;
    }

    if (enter && enter(expr) === false) {
        return;
    }

    switch (expr.kind) {
        case "literal":
        case "ident":
            break;
        case "call":
            walkExpression(expr.fn, visitor);
            for (const arg of expr.args) walkExpression(arg, visitor);
            break;
        case "if":
            walkExpression(expr.condition, visitor);
            for (const e of expr.then) walkExpression(e, visitor);
            if (expr.else) {
                for (const e of expr.else) walkExpression(e, visitor);
            }
            break;
        case "let":
            walkExpression(expr.value, visitor);
            break;
        case "match":
            walkExpression(expr.target, visitor);
            for (const arm of expr.arms) {
                for (const e of arm.body) walkExpression(e, visitor);
            }
            break;
        case "block":
        case "lambda":
            for (const e of expr.body) walkExpression(e, visitor);
            break;
        case "binop":
            walkExpression(expr.left, visitor);
            walkExpression(expr.right, visitor);
            break;
        case "unop":
            walkExpression(expr.operand, visitor);
            break;
        case "array":
        case "tuple_expr":
            for (const e of expr.elements) walkExpression(e, visitor);
            break;
        case "record_expr":
        case "enum_constructor":
            for (const f of expr.fields) walkExpression(f.value, visitor);
            break;
        case "access":
            walkExpression(expr.target, visitor);
            break;
        case "string_interp":
            for (const part of expr.parts) walkExpression(part, visitor);
            break;
        case "forall":
        case "exists":
            walkExpression(expr.range.from, visitor);
            walkExpression(expr.range.to, visitor);
            walkExpression(expr.body, visitor);
            break;
        case "tool_call":
            for (const f of expr.args) walkExpression(f.value, visitor);
            if (expr.fallback) walkExpression(expr.fallback, visitor);
            break;
        default:
            // Ensure all kinds are completely covered
            void (expr as never);
    }

    if (leave) {
        leave(expr);
    }
}
