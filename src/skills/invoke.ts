// =============================================================================
// Skill Invocation — invokeSkill(skill, limits?) → Promise<InvokeSkillResult>
// =============================================================================
// Loads WASM from a SkillPackage, verifies integrity, and executes it.
// Returns a structured result — never throws.

import { createHash } from "node:crypto";
import { run } from "../codegen/runner.js";
import type { RunLimits } from "../codegen/runner.js";
import type { SkillPackage, InvokeSkillResult } from "./types.js";

/**
 * Invoke a packaged skill — load WASM, verify checksum, execute.
 *
 * @param skill - A SkillPackage produced by packageSkill()
 * @param limits - Optional execution limits (timeout, memory, sandbox)
 * @returns Structured result with output, exit code, and any errors
 */
export async function invokeSkill(
    skill: SkillPackage,
    limits?: RunLimits,
): Promise<InvokeSkillResult> {
    // Validate package structure
    if (!skill?.binary?.wasm) {
        return {
            ok: false,
            error: "Invalid skill package format. Expected binary.wasm string.",
        };
    }

    // Decode WASM from base64
    const wasmBytes = new Uint8Array(Buffer.from(skill.binary.wasm, "base64"));

    // Verify integrity checksum
    const digest = "sha256:" + createHash("sha256").update(wasmBytes).digest("hex");
    if (digest !== skill.binary.checksum) {
        return {
            ok: false,
            error: `Checksum mismatch: expected ${skill.binary.checksum}, got ${digest}. ` +
                `The skill package may be corrupted or tampered with.`,
        };
    }

    // Execute WASM
    const entryPoint = skill.interface?.entryPoint || "main";
    try {
        const result = await run(wasmBytes, entryPoint, limits);
        return {
            ok: true,
            output: result.output,
            exitCode: result.exitCode,
            returnValue: result.returnValue,
            error: result.error,
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }
}
