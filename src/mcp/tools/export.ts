import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleExport } from "../handlers.js";

export const exportTool: EdictMcpTool = {
    name: "edict_export",
    description: "Export an Edict AST as a portable WASM skill package with validation and manifest generation.",
    schema: {
        ast: z.unknown().describe("The Edict JSON AST to compile and export"),
        metadata: z.object({
            name: z.string().default("unknown_skill"),
            version: z.string().default("1.0.0"),
            description: z.string().default(""),
            author: z.string().default("unknown")
        }).optional().describe("Optional metadata for the exported skill package")
    },
    handler: async ({ ast, metadata }) => {
        const result = await handleExport(ast, metadata || {});
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
                    { type: "text" as const, text: JSON.stringify({ errors: result.errors }, null, 2) },
                ],
                isError: true,
            };
        }
    },
};
