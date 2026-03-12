// =============================================================================
// Skill Packaging — packageSkill(input) → PackageSkillResult
// =============================================================================
// Takes an already-compiled EdictModule + WASM binary and produces a
// SkillPackage (UASF format) with interface metadata, verification info,
// capabilities, and integrity checksum.
//
// This is a pure, synchronous function — no pipeline execution.
// The caller is responsible for running check() + compile() first.

import { createHash } from "node:crypto";
import type { TypeExpr } from "../ast/types.js";
import type { UasfPackage, UasfInterface, UasfVerification } from "../mcp/uasf.js";
import type { PackageSkillInput, PackageSkillResult } from "./types.js";

/**
 * Package a compiled Edict module as a portable skill.
 *
 * @param input - The compiled module, WASM binary, and optional metadata
 * @returns Structured result: `{ ok: true, skill }` or `{ ok: false, error }`
 */
export function packageSkill(input: PackageSkillInput): PackageSkillResult {
    const { module, wasm, coverage, metadata } = input;

    // Find the entry point — must have a "main" function
    const entryPointName = "main";
    const entryDef = module.definitions.find(
        (d) => d.kind === "fn" && d.name === entryPointName,
    );

    if (!entryDef || entryDef.kind !== "fn") {
        return {
            ok: false,
            error: `No entry point function "${entryPointName}" found in module "${module.name}". ` +
                `The module must define a function named "main" to be packaged as a skill.`,
        };
    }

    // Encode WASM and compute integrity checksum
    const base64Wasm = Buffer.from(wasm).toString("base64");
    const wasmSize = wasm.length;
    const digest = "sha256:" + createHash("sha256").update(wasm).digest("hex");

    // Build interface metadata from the entry function
    const uasfInterface: UasfInterface = {
        entryPoint: entryPointName,
        params: entryDef.params.map((p) => ({
            name: p.name,
            type: p.type ? typeToString(p.type) : "unknown",
        })),
        returns: {
            type: entryDef.returnType ? typeToString(entryDef.returnType) : "unknown",
        },
        effects: entryDef.effects,
    };

    // Build verification info from coverage and contracts
    const isVerified = coverage?.contracts?.skipped === 0;
    const uasfVerification: UasfVerification = {
        verified: isVerified,
        contracts: entryDef.contracts.map((c) => ({
            kind: c.kind,
            ...(c.condition && { condition: c.condition }),
            ...(c.semantic && { semantic: c.semantic }),
        })),
        provenBy: isVerified ? "z3-solver" : undefined,
    };

    // Build the UASF skill package
    const skill: UasfPackage = {
        uasf: "1.0",
        metadata: {
            name: metadata?.name || module.name || "unknown_skill",
            version: metadata?.version || "1.0.0",
            description: metadata?.description || "",
            author: metadata?.author || "unknown",
            createdAt: new Date().toISOString(),
            tags: [],
        },
        binary: {
            wasm: base64Wasm,
            wasmSize,
            checksum: digest,
        },
        interface: uasfInterface,
        verification: uasfVerification,
        capabilities: {
            required: entryDef.effects.includes("io") ? ["io"] : [],
            optional: [],
        },
    };

    return { ok: true, skill };
}

/**
 * Convert an Edict TypeExpr to a human-readable string representation.
 * Used for skill package interface metadata.
 */
export function typeToString(type: TypeExpr): string {
    switch (type.kind) {
        case "basic": return type.name;
        case "array": return `Array<${typeToString(type.element)}>`;
        case "option": return `Option<${typeToString(type.inner)}>`;
        case "result": return `Result<${typeToString(type.ok)}, ${typeToString(type.err)}>`;
        case "unit_type": return `${type.base}<${type.unit}>`;
        case "refined": return `{ ${type.variable}: ${typeToString(type.base)} | ... }`;
        case "confidence": return `Confidence<${typeToString(type.base)}, ${type.confidence}>`;
        case "provenance": return `Provenance<${typeToString(type.base)}, [${type.sources.map(s => `"${s}"`).join(", ")}]>`;
        case "capability": return `Capability<${type.permissions.map(p => `"${p}"`).join(", ")}>`;
        case "fn_type": return `(${type.params.map(typeToString).join(", ")}) -> ${typeToString(type.returnType)}`;
        case "named": return type.name;
        case "tuple": return `(${type.elements.map(typeToString).join(", ")})`;
        default: return "unknown";
    }
}
