import { describe, it, expect } from "vitest";
import { compile } from "../../src/codegen/codegen.js";
import { runDirect } from "../../src/codegen/runner.js";
import type { EdictModule, FunctionDef, Expression } from "../../src/ast/nodes.js";
import type { ReplayToken } from "../../src/codegen/replay-types.js";

// ---------------------------------------------------------------------------
// Helpers (same as runner.test.ts)
// ---------------------------------------------------------------------------

function mkLiteral(value: number | string | boolean, id = "l-1"): Expression {
    return { kind: "literal", id, value };
}

function mkFn(
    name: string,
    body: Expression[],
    overrides: Partial<FunctionDef> = {},
): FunctionDef {
    return {
        kind: "fn",
        id: `fn-${name}`,
        name,
        params: [],
        effects: ["pure"],
        returnType: { kind: "basic", name: "Int" },
        contracts: [],
        body,
        ...overrides,
    };
}

function mkModule(
    defs: EdictModule["definitions"],
): EdictModule {
    return {
        kind: "module",
        id: "mod-test",
        name: "test",
        imports: [],
        definitions: defs,
    };
}

async function compileAndRunModule(mod: EdictModule, opts?: { record?: boolean; replayToken?: ReplayToken }) {
    const compiled = compile(mod);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(compiled.errors.join(", "));
    return runDirect(compiled.wasm, "main", {
        record: opts?.record,
        replayToken: opts?.replayToken,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("replay — recording", () => {
    it("pure program produces empty replay token", async () => {
        const mod = mkModule([mkFn("main", [mkLiteral(42)])]);
        const result = await compileAndRunModule(mod, { record: true });

        expect(result.exitCode).toBe(0);
        expect(result.returnValue).toBe(42);
        expect(result.replayToken).toBeDefined();
        expect(result.replayToken!.responses).toEqual([]);
        expect(result.replayToken!.recordedAt).toBeTruthy();
    });

    it("print output is NOT recorded (deterministic)", async () => {
        const mod = mkModule([
            mkFn(
                "main",
                [
                    {
                        kind: "call", id: "c-1",
                        fn: { kind: "ident", id: "i-print", name: "print" },
                        args: [mkLiteral("hello", "l-s")],
                    },
                    mkLiteral(0, "l-ret"),
                ],
                { effects: ["io"] },
            ),
        ]);
        const result = await compileAndRunModule(mod, { record: true });

        expect(result.exitCode).toBe(0);
        expect(result.output).toBe("hello");
        expect(result.replayToken).toBeDefined();
        // print is deterministic — not recorded
        expect(result.replayToken!.responses).toEqual([]);
    });

    it("non-record run does NOT include replay token", async () => {
        const mod = mkModule([mkFn("main", [mkLiteral(42)])]);
        const result = await compileAndRunModule(mod);

        expect(result.exitCode).toBe(0);
        expect(result.replayToken).toBeUndefined();
    });
});

describe("replay — round-trip recording and replay", () => {
    it("pure program replay produces identical result", async () => {
        const mod = mkModule([mkFn("main", [mkLiteral(42)])]);

        // Record
        const recordResult = await compileAndRunModule(mod, { record: true });
        expect(recordResult.replayToken).toBeDefined();

        // Replay
        const replayResult = await compileAndRunModule(mod, {
            replayToken: recordResult.replayToken!,
        });

        expect(replayResult.exitCode).toBe(recordResult.exitCode);
        expect(replayResult.returnValue).toBe(recordResult.returnValue);
        expect(replayResult.output).toBe(recordResult.output);
    });

    it("replay token is serializable (JSON round-trip)", async () => {
        const mod = mkModule([mkFn("main", [mkLiteral(99)])]);

        // Record
        const recordResult = await compileAndRunModule(mod, { record: true });
        expect(recordResult.replayToken).toBeDefined();

        // Serialize and deserialize the token
        const serialized = JSON.stringify(recordResult.replayToken);
        const deserialized = JSON.parse(serialized) as ReplayToken;

        // Replay with deserialized token
        const replayResult = await compileAndRunModule(mod, {
            replayToken: deserialized,
        });

        expect(replayResult.exitCode).toBe(recordResult.exitCode);
        expect(replayResult.returnValue).toBe(recordResult.returnValue);
    });
});

describe("replay — token exhaustion", () => {
    it("truncated replay token returns structured error on domain builtin call", async () => {
        // A program that calls a nondeterministic builtin — for this test
        // we use a program that calls randomInt
        const mod = mkModule([
            mkFn(
                "main",
                [
                    {
                        kind: "call", id: "c-1",
                        fn: { kind: "ident", id: "i-rng", name: "randomInt" },
                        args: [mkLiteral(1, "l-min"), mkLiteral(100, "l-max")],
                    },
                ],
                { effects: ["reads"] },
            ),
        ]);

        // Provide an empty replay token — randomInt will try to read from it
        const emptyToken: ReplayToken = {
            responses: [],
            recordedAt: new Date().toISOString(),
        };

        const result = await compileAndRunModule(mod, { replayToken: emptyToken });

        // Should fail with a structured error, not crash
        expect(result.exitCode).toBe(1);
        expect(result.output).toContain("replay_token_exhausted");
    });
});

describe("replay — nondeterministic builtin recording", () => {
    it("randomInt call is recorded in the replay token", async () => {
        const mod = mkModule([
            mkFn(
                "main",
                [
                    {
                        kind: "call", id: "c-1",
                        fn: { kind: "ident", id: "i-rng", name: "randomInt" },
                        args: [mkLiteral(1, "l-min"), mkLiteral(100, "l-max")],
                    },
                ],
                { effects: ["reads"] },
            ),
        ]);

        const result = await compileAndRunModule(mod, { record: true });

        expect(result.exitCode).toBe(0);
        expect(result.replayToken).toBeDefined();
        expect(result.replayToken!.responses.length).toBeGreaterThanOrEqual(1);

        const rngEntry = result.replayToken!.responses.find(e => e.kind === "randomInt");
        expect(rngEntry).toBeDefined();
        expect(typeof rngEntry!.result).toBe("number");
        expect(rngEntry!.result as number).toBeGreaterThanOrEqual(1);
        expect(rngEntry!.result as number).toBeLessThanOrEqual(100);
    });

    it("randomInt replay produces identical return value", async () => {
        const mod = mkModule([
            mkFn(
                "main",
                [
                    {
                        kind: "call", id: "c-1",
                        fn: { kind: "ident", id: "i-rng", name: "randomInt" },
                        args: [mkLiteral(1, "l-min"), mkLiteral(100, "l-max")],
                    },
                ],
                { effects: ["reads"] },
            ),
        ]);

        // Record
        const recordResult = await compileAndRunModule(mod, { record: true });
        expect(recordResult.exitCode).toBe(0);

        // Replay — should produce same return value
        const replayResult = await compileAndRunModule(mod, {
            replayToken: recordResult.replayToken!,
        });

        expect(replayResult.exitCode).toBe(0);
        expect(replayResult.returnValue).toBe(recordResult.returnValue);
    });
});
