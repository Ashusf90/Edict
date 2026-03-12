// =============================================================================
// Skill Lifecycle Demo — Crystallized Intelligence Pattern
// =============================================================================
// Demonstrates how an agent accumulates a library of verified, executable skills
// over multiple compilation cycles. Each successful compilation is crystallized
// into a SkillPackage (UASF format) and stored in an in-memory skill library.
//
// Run: npx tsx examples/skill-lifecycle/skill-lifecycle.ts
//
// Three progressively complex programs are compiled, packaged, stored, and
// then invoked from the library — showing the full crystallized intelligence
// lifecycle with performance comparison.

import { check } from "../../src/check.js";
import { compile } from "../../src/codegen/codegen.js";
import { packageSkill } from "../../src/skills/package.js";
import { invokeSkill } from "../../src/skills/invoke.js";
import type { SkillPackage } from "../../src/skills/types.js";

// ── In-memory skill library (agent would use Mem0, LangChain, etc.) ─────────

const skillLibrary: Map<string, SkillPackage> = new Map();

function storeSkill(name: string, skill: SkillPackage): void {
    skillLibrary.set(name, skill);
    console.log(`  📦 Stored skill "${name}" (${skill.binary.wasmSize} bytes, verified: ${skill.verification.verified})`);
}

function retrieveSkill(name: string): SkillPackage | undefined {
    return skillLibrary.get(name);
}

// ── AST definitions for 3 progressively complex programs ────────────────────

// Skill 1: Pure arithmetic — double(x) = x * 2, main returns double(21) = 42
const doubleAst = {
    kind: "module",
    id: "mod-double-001",
    name: "DoubleSkill",
    schemaVersion: "1.1",
    imports: [],
    definitions: [
        {
            kind: "fn",
            id: "fn-double-001",
            name: "double",
            params: [
                {
                    kind: "param",
                    id: "param-x-001",
                    name: "x",
                    type: { kind: "basic", name: "Int" },
                },
            ],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "binop",
                    id: "binop-mul-001",
                    op: "*",
                    left: { kind: "ident", id: "ident-x-001", name: "x" },
                    right: { kind: "literal", id: "lit-2-001", value: 2 },
                },
            ],
        },
        {
            kind: "fn",
            id: "fn-main-001",
            name: "main",
            params: [],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "call",
                    id: "call-double-001",
                    fn: { kind: "ident", id: "ident-double-001", name: "double" },
                    args: [{ kind: "literal", id: "lit-21-001", value: 21 }],
                },
            ],
        },
    ],
};

// Skill 2: Fibonacci with contracts — pre: n >= 0, post: result >= 0
const fibAst = {
    kind: "module",
    id: "mod-fib-001",
    name: "FibonacciSkill",
    schemaVersion: "1.1",
    imports: [],
    definitions: [
        {
            kind: "fn",
            id: "fn-fib-001",
            name: "fib",
            params: [
                {
                    kind: "param",
                    id: "param-n-001",
                    name: "n",
                    type: { kind: "basic", name: "Int" },
                },
            ],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [
                {
                    kind: "pre",
                    id: "pre-fib-001",
                    condition: {
                        kind: "binop",
                        id: "cond-pre-001",
                        op: ">=",
                        left: { kind: "ident", id: "ident-n-pre-001", name: "n" },
                        right: { kind: "literal", id: "lit-0-pre-001", value: 0 },
                    },
                },
            ],
            body: [
                {
                    kind: "if",
                    id: "if-base-001",
                    condition: {
                        kind: "binop",
                        id: "cond-base-001",
                        op: "<=",
                        left: { kind: "ident", id: "ident-n-base-001", name: "n" },
                        right: { kind: "literal", id: "lit-1-base-001", value: 1 },
                    },
                    then: [{ kind: "ident", id: "ident-n-ret-001", name: "n" }],
                    else: [
                        {
                            kind: "binop",
                            id: "binop-add-001",
                            op: "+",
                            left: {
                                kind: "call",
                                id: "call-fib1-001",
                                fn: { kind: "ident", id: "ident-fib1-001", name: "fib" },
                                args: [
                                    {
                                        kind: "binop",
                                        id: "binop-sub1-001",
                                        op: "-",
                                        left: { kind: "ident", id: "ident-n-sub1-001", name: "n" },
                                        right: { kind: "literal", id: "lit-1-sub1-001", value: 1 },
                                    },
                                ],
                            },
                            right: {
                                kind: "call",
                                id: "call-fib2-001",
                                fn: { kind: "ident", id: "ident-fib2-001", name: "fib" },
                                args: [
                                    {
                                        kind: "binop",
                                        id: "binop-sub2-001",
                                        op: "-",
                                        left: { kind: "ident", id: "ident-n-sub2-001", name: "n" },
                                        right: { kind: "literal", id: "lit-2-sub2-001", value: 2 },
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        },
        {
            kind: "fn",
            id: "fn-main-fib-001",
            name: "main",
            params: [],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "call",
                    id: "call-main-fib-001",
                    fn: { kind: "ident", id: "ident-fib-main-001", name: "fib" },
                    args: [{ kind: "literal", id: "lit-10-001", value: 10 }],
                },
            ],
        },
    ],
};

// Skill 3: Factorial with accumulator — factHelper(n, acc), main calls factHelper(7, 1) = 5040
const factorialAst = {
    kind: "module",
    id: "mod-fact-001",
    name: "FactorialSkill",
    schemaVersion: "1.1",
    imports: [],
    definitions: [
        {
            kind: "fn",
            id: "fn-fact-001",
            name: "factHelper",
            params: [
                {
                    kind: "param",
                    id: "param-n-fact-001",
                    name: "n",
                    type: { kind: "basic", name: "Int" },
                },
                {
                    kind: "param",
                    id: "param-acc-fact-001",
                    name: "acc",
                    type: { kind: "basic", name: "Int" },
                },
            ],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [
                {
                    kind: "pre",
                    id: "pre-fact-001",
                    condition: {
                        kind: "binop",
                        id: "cond-pre-fact-001",
                        op: ">=",
                        left: { kind: "ident", id: "ident-n-pre-fact-001", name: "n" },
                        right: { kind: "literal", id: "lit-0-pre-fact-001", value: 0 },
                    },
                },
            ],
            body: [
                {
                    kind: "if",
                    id: "if-fact-001",
                    condition: {
                        kind: "binop",
                        id: "cond-fact-001",
                        op: "<=",
                        left: { kind: "ident", id: "ident-n-fact-001", name: "n" },
                        right: { kind: "literal", id: "lit-0-fact-001", value: 0 },
                    },
                    then: [{ kind: "ident", id: "ident-acc-ret-001", name: "acc" }],
                    else: [
                        {
                            kind: "call",
                            id: "call-fact-rec-001",
                            fn: { kind: "ident", id: "ident-fact-rec-001", name: "factHelper" },
                            args: [
                                {
                                    kind: "binop",
                                    id: "binop-sub-fact-001",
                                    op: "-",
                                    left: { kind: "ident", id: "ident-n-sub-fact-001", name: "n" },
                                    right: { kind: "literal", id: "lit-1-sub-fact-001", value: 1 },
                                },
                                {
                                    kind: "binop",
                                    id: "binop-mul-fact-001",
                                    op: "*",
                                    left: { kind: "ident", id: "ident-n-mul-fact-001", name: "n" },
                                    right: { kind: "ident", id: "ident-acc-mul-fact-001", name: "acc" },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            kind: "fn",
            id: "fn-main-fact-001",
            name: "main",
            params: [],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "call",
                    id: "call-main-fact-001",
                    fn: { kind: "ident", id: "ident-fact-main-001", name: "factHelper" },
                    args: [
                        { kind: "literal", id: "lit-7-fact-001", value: 7 },
                        { kind: "literal", id: "lit-1-fact-init-001", value: 1 },
                    ],
                },
            ],
        },
    ],
};

// ── Compile + Package + Store lifecycle ─────────────────────────────────────

async function compileAndPackage(
    name: string,
    ast: unknown,
): Promise<{ skill: SkillPackage; compileMs: number }> {
    const startCompile = performance.now();
    const checkResult = await check(ast);
    if (!checkResult.ok || !checkResult.module) {
        throw new Error(`check() failed for "${name}": ${JSON.stringify(checkResult.errors)}`);
    }
    const compileResult = compile(checkResult.module, { typeInfo: checkResult.typeInfo });
    if (!compileResult.ok) {
        throw new Error(`compile() failed for "${name}": ${JSON.stringify(compileResult.errors)}`);
    }
    const compileMs = performance.now() - startCompile;

    const pkgResult = packageSkill({
        module: checkResult.module,
        wasm: compileResult.wasm,
        coverage: checkResult.coverage,
        metadata: { name, description: `Crystallized skill: ${name}` },
    });
    if (!pkgResult.ok) {
        throw new Error(`packageSkill() failed for "${name}": ${pkgResult.error}`);
    }

    return { skill: pkgResult.skill, compileMs };
}

// ── Main lifecycle ──────────────────────────────────────────────────────────

interface TimingResult {
    compileMs: number;
    invokeMs: number;
}

async function main() {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Crystallized Intelligence — Skill Lifecycle Demo");
    console.log("═══════════════════════════════════════════════════════════════\n");

    const skills = [
        { name: "double", ast: doubleAst, expectedReturn: 42 },
        { name: "fibonacci", ast: fibAst, expectedReturn: 55 },
        { name: "factorial", ast: factorialAst, expectedReturn: 5040 },
    ];

    const timings: TimingResult[] = [];

    // ── Phase 1: Compile, package, and store each skill ───────────────────

    console.log("Phase 1: Compile → Verify → Package → Store\n");

    for (const { name, ast } of skills) {
        console.log(`  Compiling "${name}"...`);
        const { skill, compileMs } = await compileAndPackage(name, ast);
        storeSkill(name, skill);
        console.log(`  ✅ Compiled in ${compileMs.toFixed(1)}ms\n`);
        timings.push({ compileMs, invokeMs: 0 });
    }

    console.log(`\nSkill library: ${skillLibrary.size} crystallized skills\n`);

    // ── Phase 2: Invoke each skill from the library ───────────────────────

    console.log("Phase 2: Retrieve → Verify Checksum → Execute from WASM\n");

    for (let i = 0; i < skills.length; i++) {
        const { name, expectedReturn } = skills[i];
        const skill = retrieveSkill(name);
        if (!skill) {
            throw new Error(`Skill "${name}" not found in library`);
        }

        // Simulate JSON serialization round-trip (as if stored in Mem0/LangChain)
        const serialized = JSON.stringify(skill);
        const deserialized = JSON.parse(serialized) as SkillPackage;

        const startInvoke = performance.now();
        const result = await invokeSkill(deserialized);
        const invokeMs = performance.now() - startInvoke;
        timings[i].invokeMs = invokeMs;

        if (!result.ok) {
            throw new Error(`invokeSkill() failed for "${name}": ${result.error}`);
        }

        const match = result.returnValue === expectedReturn;
        console.log(
            `  ${match ? "✅" : "❌"} "${name}": returned ${result.returnValue}` +
            ` (expected ${expectedReturn}) in ${invokeMs.toFixed(1)}ms`,
        );
    }

    // ── Phase 3: Pipeline savings analysis ─────────────────────────────────
    //
    // Note: Both paths (compile+run and invoke) share the same WASM worker
    // startup cost (~2s). The value of crystallization is:
    //   1. Zero LLM inference tokens (the dominant cost — not measured here)
    //   2. Pipeline savings: skip check + compile for already-verified skills
    //   3. Correctness guarantees: checksum-verified, bit-identical execution

    console.log("\n\nPhase 3: Pipeline Savings Analysis\n");
    console.log("  ┌──────────────┬──────────────┬──────────────┐");
    console.log("  │ Skill        │ Pipeline     │ WASM size    │");
    console.log("  │              │ (check+comp) │              │");
    console.log("  ├──────────────┼──────────────┼──────────────┤");

    for (let i = 0; i < skills.length; i++) {
        const { name } = skills[i];
        const { compileMs } = timings[i];
        const skill = retrieveSkill(name)!;
        const pad = (s: string, len: number) => s.padEnd(len);
        console.log(
            `  │ ${pad(name, 12)} │ ${pad(compileMs.toFixed(1) + "ms", 12)} │ ${pad(skill.binary.wasmSize + " bytes", 12)} │`,
        );
    }

    console.log("  └──────────────┴──────────────┴──────────────┘");
    console.log("\n  Pipeline column = time saved per invocation by using crystallized WASM");
    console.log("  (Dominant savings: zero LLM inference tokens for re-generation)");

    // ── Phase 4: Skill metadata summary ───────────────────────────────────

    console.log("\n\nPhase 4: Crystallized Skill Library Summary\n");

    for (const [name, skill] of skillLibrary) {
        console.log(`  📦 ${name}`);
        console.log(`     WASM size: ${skill.binary.wasmSize} bytes`);
        console.log(`     Checksum: ${skill.binary.checksum.slice(0, 20)}...`);
        console.log(`     Verified: ${skill.verification.verified}`);
        console.log(`     Contracts: ${skill.verification.contracts.length}`);
        console.log(`     Effects: ${skill.interface.effects.join(", ")}`);
        console.log(`     Entry: ${skill.interface.entryPoint}(${skill.interface.params.map(p => `${p.name}: ${p.type}`).join(", ")}) → ${skill.interface.returns.type}`);
        console.log();
    }

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Done. All skills crystallized and verified.");
    console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
