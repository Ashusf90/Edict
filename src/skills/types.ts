// =============================================================================
// Skill Package Types — Structured interfaces for skill packaging and invocation
// =============================================================================
// Re-exports UASF types under agent-facing aliases and defines input/result types
// for the standalone packageSkill() and invokeSkill() library functions.

import type { EdictModule } from "../ast/nodes.js";
import type { VerificationCoverage } from "../errors/structured-errors.js";

// Re-export UASF types under agent-facing aliases (single source of truth)
export type { UasfPackage as SkillPackage } from "../mcp/uasf.js";
export type { UasfMetadata as SkillMetadata } from "../mcp/uasf.js";
export type { UasfBinary as SkillBinary } from "../mcp/uasf.js";
export type { UasfInterface as SkillInterface } from "../mcp/uasf.js";
export type { UasfVerification as SkillVerification } from "../mcp/uasf.js";
export type { UasfCapabilities as SkillCapabilities } from "../mcp/uasf.js";

/**
 * Input for packageSkill() — the already-compiled module + WASM binary.
 * The caller is responsible for running check() + compile() first.
 */
export interface PackageSkillInput {
    /** The validated, type-checked EdictModule AST */
    module: EdictModule;
    /** The compiled WASM binary (Uint8Array from compile()) */
    wasm: Uint8Array;
    /** Verification coverage from check() — used to determine if contracts were proven */
    coverage?: VerificationCoverage;
    /** Optional metadata to embed in the skill package */
    metadata?: {
        name?: string;
        version?: string;
        description?: string;
        author?: string;
    };
}

/**
 * Result of packageSkill(). Structured result — never throws.
 */
export type PackageSkillResult = PackageSkillSuccess | PackageSkillFailure;

export interface PackageSkillSuccess {
    ok: true;
    skill: import("../mcp/uasf.js").UasfPackage;
}

export interface PackageSkillFailure {
    ok: false;
    error: string;
}

/**
 * Result of invokeSkill(). Structured result — never throws.
 */
export interface InvokeSkillResult {
    ok: boolean;
    output?: string;
    exitCode?: number;
    returnValue?: number;
    error?: string;
}
