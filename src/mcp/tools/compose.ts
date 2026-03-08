import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleCompose } from "../handlers.js";

export const composeTool: EdictMcpTool = {
    name: "edict_compose",
    description: "Compose multiple Edict program fragments into a single module. Fragments declare what they provide and require, enabling independent validation and incremental program generation.",
    schema: {
        fragments: z
            .array(z.any())
            .describe("Array of Edict fragment ASTs to compose"),
        moduleName: z
            .string()
            .optional()
            .describe("Name for the composed module (default: 'composed')"),
        moduleId: z
            .string()
            .optional()
            .describe("ID for the composed module (default: 'mod-composed-001')"),
        check: z
            .boolean()
            .optional()
            .describe("If true, run the full type/effect/contract pipeline on the composed module"),
    },
    handler: async ({ fragments, moduleName, moduleId, check }) => {
        const result = await handleCompose(
            fragments,
            moduleName ?? "composed",
            moduleId ?? "mod-composed-001",
            check ?? false,
        );
        if (result.ok) {
            return {
                content: [
                    { type: "text" as const, text: JSON.stringify({ ok: true, module: result.module }, null, 2) },
                ],
            };
        } else {
            return {
                content: [
                    { type: "text" as const, text: JSON.stringify({ errors: result.errors, module: result.module }, null, 2) },
                ],
                isError: true,
            };
        }
    },
};
