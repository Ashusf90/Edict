import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleCheck, handleCheckMulti } from "../handlers.js";

export const checkTool: EdictMcpTool = {
    name: "edict_check",
    description: "Run the full semantic checker (name resolution, type checking, effect checking, contract verification) on an AST. Supports single module (ast) or multi-module (modules array) input.",
    schema: {
        ast: z.any().optional().describe("The Edict JSON AST to check (single module)"),
        modules: z.array(z.any()).optional().describe("Array of Edict module ASTs to check together (multi-module). Cross-module imports are resolved automatically."),
    },
    handler: async ({ ast, modules }) => {
        const result = modules
            ? await handleCheckMulti(modules)
            : await handleCheck(ast);
        if (result.ok) {
            return { content: [{ type: "text" as const, text: "AST passed all semantic checks." }] };
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
