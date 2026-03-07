import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleSchema } from "../handlers.js";

export const schemaTool: EdictMcpTool = {
    name: "edict_schema",
    description: "Return the JSON Schema defining valid Edict AST programs. Use format 'minimal' for reduced token cost (strips descriptions).",
    schema: {
        format: z.enum(["full", "minimal", "compact"]).optional().default("full").describe("Schema format: 'full' (default, with descriptions), 'minimal' (stripped for token efficiency), or 'compact' (compact key/kind mapping reference)"),
    },
    handler: async ({ format }) => {
        const result = handleSchema(format);
        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify({ schema: result.schema, format: result.format, tokenEstimate: result.tokenEstimate }),
                },
            ],
        };
    },
};
