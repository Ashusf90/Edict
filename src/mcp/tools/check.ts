import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleCheck } from "../handlers.js";

export const checkTool: EdictMcpTool = {
    name: "edict_check",
    description: "Run the full semantic checker (name resolution, type checking, effect checking, contract verification) on an AST.",
    schema: {
        ast: z.any().describe("The Edict JSON AST to check"),
    },
    handler: async ({ ast }) => {
        const result = await handleCheck(ast);
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
