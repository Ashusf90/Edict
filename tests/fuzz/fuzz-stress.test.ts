import { describe, it, expect } from "vitest";
import { validate } from "../../src/validator/validate.js";

// =============================================================================
// Stress and boundary tests — adversarial sizes and edge cases
// =============================================================================
// These are deterministic (not property-based) tests at extreme scales.

/** Helper: generate a unique ID */
const uid = (prefix: string, i: number) => `${prefix}-${i}`;

describe("fuzz — stress tests", () => {
    // =========================================================================
    // Test 1: Large module (200 function definitions)
    // =========================================================================
    it("handles a module with 200 function definitions", () => {
        const definitions = [];
        for (let i = 0; i < 200; i++) {
            const params = [];
            for (let j = 0; j < 5; j++) {
                params.push({
                    kind: "param",
                    id: uid("p", i * 5 + j),
                    name: `p${j}`,
                    type: { kind: "basic", name: "Int" },
                });
            }

            const body = [];
            for (let j = 0; j < 10; j++) {
                body.push({ kind: "literal", id: uid("lit", i * 10 + j), value: j });
            }

            definitions.push({
                kind: "fn",
                id: uid("fn", i),
                name: `func${i}`,
                params,
                effects: ["pure"],
                returnType: { kind: "basic", name: "Int" },
                contracts: [],
                body,
            });
        }

        const ast = {
            kind: "module",
            id: "stress-large-mod",
            name: "large",
            imports: [],
            definitions,
        };

        const result = validate(ast);
        expect(result).toBeDefined();
        expect(result.ok).toBe(true);
    });

    // =========================================================================
    // Test 2: Deep nesting (200 levels of nested if-expressions)
    // =========================================================================
    it("handles 200-deep nested if-expressions without stack overflow", () => {
        // Build: if(true, if(true, if(true, ... 42 ...)))
        let expr: unknown = { kind: "literal", id: "deep-base", value: 42 };
        for (let i = 0; i < 200; i++) {
            expr = {
                kind: "if",
                id: uid("if", i),
                condition: { kind: "literal", id: uid("cond", i), value: true },
                then: [expr],
                else: [{ kind: "literal", id: uid("else", i), value: 0 }],
            };
        }

        const ast = {
            kind: "module",
            id: "stress-deep-mod",
            name: "deep",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "stress-deep-fn",
                    name: "main",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [expr],
                },
            ],
        };

        const result = validate(ast);
        expect(result).toBeDefined();
        expect(result.ok).toBe(true);
    });

    // =========================================================================
    // Test 3: Deep nesting (200 levels of nested binops)
    // =========================================================================
    it("handles 200-deep nested binary operations without stack overflow", () => {
        let expr: unknown = { kind: "literal", id: "binop-base", value: 1 };
        for (let i = 0; i < 200; i++) {
            expr = {
                kind: "binop",
                id: uid("binop", i),
                op: "+",
                left: { kind: "literal", id: uid("bl", i), value: 1 },
                right: expr,
            };
        }

        const ast = {
            kind: "module",
            id: "stress-binop-mod",
            name: "binops",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "stress-binop-fn",
                    name: "main",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [expr],
                },
            ],
        };

        const result = validate(ast);
        expect(result).toBeDefined();
        expect(result.ok).toBe(true);
    });

    // =========================================================================
    // Test 4: Long string literal (100KB)
    // =========================================================================
    it("handles a 100KB string literal without crash", () => {
        const longString = "x".repeat(100_000);
        const ast = {
            kind: "module",
            id: "stress-string-mod",
            name: "longstr",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "stress-string-fn",
                    name: "main",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "String" },
                    contracts: [],
                    body: [{ kind: "literal", id: "stress-string-lit", value: longString }],
                },
            ],
        };

        const result = validate(ast);
        expect(result).toBeDefined();
        expect(result.ok).toBe(true);
    });

    // =========================================================================
    // Test 5: Function with 100 parameters
    // =========================================================================
    it("handles a function with 100 parameters", () => {
        const params = [];
        for (let i = 0; i < 100; i++) {
            params.push({
                kind: "param",
                id: uid("param", i),
                name: `p${i}`,
                type: { kind: "basic", name: "Int" },
            });
        }

        const ast = {
            kind: "module",
            id: "stress-params-mod",
            name: "manyparams",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "stress-params-fn",
                    name: "main",
                    params,
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [{ kind: "literal", id: "stress-params-lit", value: 0 }],
                },
            ],
        };

        const result = validate(ast);
        expect(result).toBeDefined();
        expect(result.ok).toBe(true);
    });

    // =========================================================================
    // Test 6: Match with 100 arms
    // =========================================================================
    it("handles a match expression with 100 arms", () => {
        const arms = [];
        for (let i = 0; i < 99; i++) {
            arms.push({
                kind: "arm",
                id: uid("arm", i),
                pattern: { kind: "literal_pattern", value: i },
                body: [{ kind: "literal", id: uid("arm-lit", i), value: i }],
            });
        }
        // Wildcard arm at end
        arms.push({
            kind: "arm",
            id: "arm-wildcard",
            pattern: { kind: "wildcard" },
            body: [{ kind: "literal", id: "arm-wildcard-lit", value: -1 }],
        });

        const ast = {
            kind: "module",
            id: "stress-match-mod",
            name: "manyarms",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "stress-match-fn",
                    name: "main",
                    params: [
                        {
                            kind: "param",
                            id: "stress-match-param",
                            name: "x",
                            type: { kind: "basic", name: "Int" },
                        },
                    ],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [
                        {
                            kind: "match",
                            id: "stress-match-expr",
                            target: { kind: "ident", id: "stress-match-target", name: "x" },
                            arms,
                        },
                    ],
                },
            ],
        };

        const result = validate(ast);
        expect(result).toBeDefined();
        expect(result.ok).toBe(true);
    });

    // =========================================================================
    // Test 7: Many nested let bindings (100)
    // =========================================================================
    it("handles 100 nested let bindings", () => {
        // let x0 = 0; let x1 = x0; let x2 = x1; ... return x99
        let body: unknown = { kind: "ident", id: "stress-let-final", name: "x99" };
        for (let i = 99; i >= 0; i--) {
            const value = i === 0
                ? { kind: "literal", id: uid("let-val", i), value: 0 }
                : { kind: "ident", id: uid("let-ref", i), name: `x${i - 1}` };
            body = {
                kind: "let",
                id: uid("let", i),
                name: `x${i}`,
                type: { kind: "basic", name: "Int" },
                value,
            };
        }

        const ast = {
            kind: "module",
            id: "stress-let-mod",
            name: "manylets",
            imports: [],
            definitions: [
                {
                    kind: "fn",
                    id: "stress-let-fn",
                    name: "main",
                    params: [],
                    effects: ["pure"],
                    returnType: { kind: "basic", name: "Int" },
                    contracts: [],
                    body: [body, { kind: "ident", id: "stress-let-ret", name: "x99" }],
                },
            ],
        };

        const result = validate(ast);
        expect(result).toBeDefined();
        expect(result.ok).toBe(true);
    });
});
