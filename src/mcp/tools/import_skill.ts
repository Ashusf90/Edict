import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleImportSkill } from "../handlers.js";

export const importSkillTool: EdictMcpTool = {
    name: "edict_import_skill",
    description: "Import and execute a compiled Edict WASM skill package, validating its checksum.",
    schema: {
        skill: z.object({
            uasf: z.string().optional(),
            metadata: z.object({
                name: z.string().optional(),
                version: z.string().optional(),
                description: z.string().optional(),
                author: z.string().optional(),
            }).passthrough().optional(),
            interface: z.object({
                entryPoint: z.string().optional(),
            }).passthrough().optional(),
            binary: z.object({
                wasm: z.string(),
                wasmSize: z.number().optional(),
                checksum: z.string()
            }).passthrough()
        }).passthrough().describe("The skill package JSON object (produced by edict_export)"),
        limits: z.object({
            timeoutMs: z.number().optional().describe("Max execution time in milliseconds (default: 15000, min: 100)"),
            maxMemoryMb: z.number().optional().describe("Max WASM memory in MB (compile-time limit, default: 1)"),
            sandboxDir: z.string().optional().describe("Sandbox directory for file IO builtins")
        }).optional().describe("Optional execution sandbox limits"),
    },
    handler: async ({ skill, limits }) => {
        const result = await handleImportSkill(skill, limits);
        if (result.ok) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(result, null, 2),
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
