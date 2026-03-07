import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleValidate } from "../handlers.js";

export const validateTool: EdictMcpTool = {
    name: "edict_validate",
    description: "Validate an Edict AST against the compiler's JSON schema without typing or compiling. Use this as a first pass.",
    schema: {
        ast: z.any().describe("The Edict JSON AST to validate"),
    },
    handler: async ({ ast }) => {
        const result = handleValidate(ast);
        if (result.ok) {
            return { content: [{ type: "text" as const, text: "AST is schema-valid." }] };
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
