import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handlePackageSkill } from "../handlers.js";

export const packageSkillTool: EdictMcpTool = {
    name: "edict_package",
    description: "Package a compiled Edict module + WASM binary into a portable SkillPackage. Input: the module AST (same one sent to edict_compile) + the base64 WASM string returned by edict_compile. Output: a SkillPackage JSON with interface metadata, verification info, integrity checksum, and the embedded WASM.",
    schema: {
        ast: z.unknown().describe("The Edict module AST (the same JSON sent to edict_compile)"),
        wasm: z.string().describe("Base64-encoded WASM binary (from edict_compile result)"),
        metadata: z.object({
            name: z.string().optional().describe("Skill name"),
            version: z.string().optional().describe("Skill version"),
            description: z.string().optional().describe("Skill description"),
            author: z.string().optional().describe("Skill author"),
        }).optional().describe("Optional metadata to embed in the skill package"),
    },
    handler: async ({ ast, wasm, metadata }) => {
        const result = handlePackageSkill(ast, wasm as string, metadata);
        if (result.ok && result.skill) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(result.skill, null, 2),
                    },
                ],
            };
        } else {
            return {
                content: [
                    { type: "text" as const, text: JSON.stringify({ error: result.error }, null, 2) },
                ],
                isError: true,
            };
        }
    },
};
