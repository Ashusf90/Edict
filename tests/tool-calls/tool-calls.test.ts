import { describe, it, expect } from "vitest";
import { resolve } from "../../src/resolver/resolve.js";
import { typeCheck } from "../../src/checker/check.js";
import { effectCheck } from "../../src/effects/effect-check.js";
import { buildCallGraph } from "../../src/effects/call-graph.js";
import { lint } from "../../src/lint/lint.js";
import type { EdictModule, FunctionDef, ToolDef, Expression, ToolCallExpr } from "../../src/ast/nodes.js";

// =============================================================================
// Helpers
// =============================================================================

function mod(overrides: Partial<EdictModule> = {}): EdictModule {
    return {
        kind: "module",
        id: "mod-test",
        name: "test",
        imports: [],
        definitions: [],
        ...overrides,
    };
}

function toolDef(overrides: Partial<ToolDef> = {}): ToolDef {
    return {
        kind: "tool",
        id: "tool-weather",
        name: "get_weather",
        uri: "mcp://weather/get",
        params: [
            { kind: "param", id: "p-city", name: "city", type: { kind: "basic", name: "String" } },
        ],
        returnType: { kind: "basic", name: "String" },
        effects: ["io"],
        ...overrides,
    };
}

function toolCallExpr(overrides: Partial<ToolCallExpr> = {}): ToolCallExpr {
    return {
        kind: "tool_call",
        id: "tc-001",
        tool: "get_weather",
        args: [
            { kind: "field_init", name: "city", value: { kind: "literal", id: "lit-city", value: "Berlin" } },
        ],
        ...overrides,
    };
}

/** A function that calls a tool */
function fnWithToolCall(
    fnOverrides: Partial<FunctionDef> = {},
    tcOverrides: Partial<ToolCallExpr> = {},
): FunctionDef {
    return {
        kind: "fn",
        id: "fn-main",
        name: "main",
        params: [],
        effects: ["io"],
        returnType: { kind: "result", ok: { kind: "basic", name: "String" }, err: { kind: "basic", name: "String" } },
        contracts: [],
        body: [toolCallExpr(tcOverrides)],
        ...fnOverrides,
    };
}

// =============================================================================
// Resolver
// =============================================================================

describe("tool_call — resolver", () => {
    it("resolves tool_call referencing a declared ToolDef", () => {
        const errors = resolve(mod({
            definitions: [
                toolDef(),
                fnWithToolCall(),
            ],
        }));
        expect(errors).toEqual([]);
    });

    it("emits unknown_tool when tool name is not declared", () => {
        const errors = resolve(mod({
            definitions: [
                fnWithToolCall({}, { tool: "get_forcast" }),
            ],
        }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
            error: "unknown_tool",
            nodeId: "tc-001",
            toolName: "get_forcast",
        });
    });

    it("provides Levenshtein candidates when tool name has typo", () => {
        const errors = resolve(mod({
            definitions: [
                toolDef(),
                fnWithToolCall({}, { tool: "get_weathr" }),
            ],
        }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ error: "unknown_tool" });
        expect((errors[0] as any).registeredTools).toContain("get_weather");
    });

    it("resolves ident references inside tool_call arg values", () => {
        const errors = resolve(mod({
            definitions: [
                toolDef(),
                {
                    kind: "fn", id: "fn-main", name: "main",
                    params: [{ kind: "param", id: "p-c", name: "city_name", type: { kind: "basic", name: "String" } }],
                    effects: ["io"],
                    returnType: { kind: "result", ok: { kind: "basic", name: "String" }, err: { kind: "basic", name: "String" } },
                    contracts: [],
                    body: [
                        toolCallExpr({
                            args: [{ kind: "field_init", name: "city", value: { kind: "ident", id: "id-c", name: "city_name" } }],
                        }),
                    ],
                } satisfies FunctionDef,
            ],
        }));
        expect(errors).toEqual([]);
    });

    it("reports undefined_reference for unknown ident in tool_call arg value", () => {
        const errors = resolve(mod({
            definitions: [
                toolDef(),
                {
                    kind: "fn", id: "fn-main", name: "main",
                    params: [],
                    effects: ["io"],
                    returnType: { kind: "result", ok: { kind: "basic", name: "String" }, err: { kind: "basic", name: "String" } },
                    contracts: [],
                    body: [
                        toolCallExpr({
                            args: [{ kind: "field_init", name: "city", value: { kind: "ident", id: "id-x", name: "unknown_var" } }],
                        }),
                    ],
                } satisfies FunctionDef,
            ],
        }));
        const refErrors = errors.filter(e => e.error === "undefined_reference");
        expect(refErrors).toHaveLength(1);
        expect(refErrors[0]).toMatchObject({ name: "unknown_var" });
    });

    it("resolves tool_call fallback expression", () => {
        const errors = resolve(mod({
            definitions: [
                toolDef(),
                fnWithToolCall({}, {
                    fallback: {
                        kind: "enum_constructor", id: "ec-ok", enumName: "Result", variant: "Ok",
                        fields: [{ kind: "field_init", name: "value", value: { kind: "literal", id: "lit-fb", value: "default" } }],
                    },
                }),
            ],
        }));
        expect(errors).toEqual([]);
    });

    it("resolves ToolDef param and return types (Named type refs)", () => {
        const errors = resolve(mod({
            definitions: [
                { kind: "record", id: "r-loc", name: "Location", fields: [
                    { kind: "field", id: "f-city", name: "city", type: { kind: "basic", name: "String" } },
                ] },
                toolDef({
                    params: [{ kind: "param", id: "p-loc", name: "loc", type: { kind: "named", name: "Location" } }],
                    returnType: { kind: "basic", name: "String" },
                }),
                fnWithToolCall({}, {
                    args: [{ kind: "field_init", name: "loc", value: {
                        kind: "record_expr", id: "re-loc", name: "Location",
                        fields: [{ kind: "field_init", name: "city", value: { kind: "literal", id: "lit-c", value: "Berlin" } }],
                    }}],
                }),
            ],
        }));
        expect(errors).toEqual([]);
    });
});

// =============================================================================
// Checker
// =============================================================================

describe("tool_call — checker", () => {
    it("infers Result<T, String> return type", () => {
        const m = mod({
            definitions: [
                toolDef({ returnType: { kind: "basic", name: "Int" } }),
                fnWithToolCall({
                    returnType: { kind: "result", ok: { kind: "basic", name: "Int" }, err: { kind: "basic", name: "String" } },
                }),
            ],
        });
        const { errors } = typeCheck(m);
        expect(errors).toEqual([]);
    });

    it("passes when named args match tool params", () => {
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall(),
            ],
        });
        const { errors } = typeCheck(m);
        expect(errors).toEqual([]);
    });

    it("emits tool_arg_mismatch for missing args", () => {
        const m = mod({
            definitions: [
                toolDef({
                    params: [
                        { kind: "param", id: "p-city", name: "city", type: { kind: "basic", name: "String" } },
                        { kind: "param", id: "p-unit", name: "unit", type: { kind: "basic", name: "String" } },
                    ],
                }),
                fnWithToolCall({}, {
                    args: [
                        { kind: "field_init", name: "city", value: { kind: "literal", id: "lit-c", value: "Berlin" } },
                    ],
                }),
            ],
        });
        const { errors } = typeCheck(m);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
            error: "tool_arg_mismatch",
            toolName: "get_weather",
            missingArgs: ["unit"],
        });
    });

    it("emits tool_arg_mismatch for extra args", () => {
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall({}, {
                    args: [
                        { kind: "field_init", name: "city", value: { kind: "literal", id: "lit-c", value: "Berlin" } },
                        { kind: "field_init", name: "format", value: { kind: "literal", id: "lit-f", value: "json" } },
                    ],
                }),
            ],
        });
        const { errors } = typeCheck(m);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
            error: "tool_arg_mismatch",
            toolName: "get_weather",
            extraArgs: ["format"],
        });
    });

    it("emits tool_arg_mismatch for type mismatch in args", () => {
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall({}, {
                    args: [
                        { kind: "field_init", name: "city", value: { kind: "literal", id: "lit-c", value: 42 } },
                    ],
                }),
            ],
        });
        const { errors } = typeCheck(m);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
            error: "tool_arg_mismatch",
            toolName: "get_weather",
        });
        expect((errors[0] as any).typeMismatches).toHaveLength(1);
        expect((errors[0] as any).typeMismatches[0].arg).toBe("city");
    });

    it("type-checks fallback expression", () => {
        // Mismatched fallback type → type_mismatch error
        // Tool returns Result<String, String> but fallback is Int
        const m = mod({
            definitions: [
                toolDef({ returnType: { kind: "basic", name: "String" } }),
                fnWithToolCall({}, {
                    fallback: { kind: "literal", id: "lit-fb", value: 42 },
                }),
            ],
        });
        const { errors } = typeCheck(m);
        const mismatches = errors.filter(e => e.error === "type_mismatch");
        expect(mismatches.length).toBeGreaterThanOrEqual(1);
    });

    it("emits type_mismatch for wrong return type annotation", () => {
        // Function declares Int return but tool_call produces Result<String, String>
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall({
                    returnType: { kind: "basic", name: "Int" },
                }),
            ],
        });
        const { errors } = typeCheck(m);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ error: "type_mismatch" });
    });
});

// =============================================================================
// Effects
// =============================================================================

describe("tool_call — effects", () => {
    it("registers ToolDef as EffectSource in call graph", () => {
        const m = mod({
            definitions: [
                toolDef({ effects: ["io"] }),
                fnWithToolCall(),
            ],
        });
        const { effectSources } = buildCallGraph(m);
        const toolSource = effectSources.get("get_weather");
        expect(toolSource).toBeDefined();
        expect(toolSource!.effects).toContain("io");
        expect(toolSource!.id).toBe("tool-weather");
    });

    it("creates a call edge from tool_call to the ToolDef", () => {
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall(),
            ],
        });
        const { graph } = buildCallGraph(m);
        const mainEdges = graph.get("main");
        expect(mainEdges).toBeDefined();
        expect(mainEdges!.some(e => e.calleeName === "get_weather")).toBe(true);
    });

    it("propagates tool's io effect to the calling function", () => {
        // Caller declares pure but calls a tool with io → effect_violation
        const m = mod({
            definitions: [
                toolDef({ effects: ["io"] }),
                fnWithToolCall({ effects: ["pure"] }),
            ],
        });
        const { errors } = effectCheck(m);
        const violations = errors.filter(e => e.error === "effect_in_pure");
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            calleeName: "get_weather",
            functionName: "main",
        });
    });

    it("does NOT add implicit 'fails' effect to tool calls", () => {
        // Tool declares only ["io"] — caller with ["io"] should pass
        const m = mod({
            definitions: [
                toolDef({ effects: ["io"] }),
                fnWithToolCall({ effects: ["io"] }),
            ],
        });
        const { errors } = effectCheck(m);
        expect(errors).toEqual([]);
    });
});

// =============================================================================
// Lint
// =============================================================================

describe("tool_call — lint", () => {
    it("warns about missing retry policy", () => {
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall({}, { retryPolicy: undefined, timeout: 5000 }),
            ],
        });
        const warnings = lint(m);
        const retryWarnings = warnings.filter(w => w.warning === "tool_call_no_retry");
        expect(retryWarnings).toHaveLength(1);
        expect(retryWarnings[0]).toMatchObject({
            nodeId: "tc-001",
            toolName: "get_weather",
        });
    });

    it("warns about missing timeout", () => {
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall({}, {
                    retryPolicy: { maxRetries: 3, backoff: "exponential" },
                    timeout: undefined,
                }),
            ],
        });
        const warnings = lint(m);
        const timeoutWarnings = warnings.filter(w => w.warning === "tool_call_no_timeout");
        expect(timeoutWarnings).toHaveLength(1);
    });

    it("does NOT warn when retry policy is present", () => {
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall({}, {
                    retryPolicy: { maxRetries: 3, backoff: "exponential" },
                    timeout: 5000,
                }),
            ],
        });
        const warnings = lint(m);
        expect(warnings.filter(w => w.warning === "tool_call_no_retry")).toHaveLength(0);
    });

    it("does NOT warn when timeout is present", () => {
        const m = mod({
            definitions: [
                toolDef(),
                fnWithToolCall({}, {
                    retryPolicy: { maxRetries: 3, backoff: "exponential" },
                    timeout: 5000,
                }),
            ],
        });
        const warnings = lint(m);
        expect(warnings.filter(w => w.warning === "tool_call_no_timeout")).toHaveLength(0);
    });
});
