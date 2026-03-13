import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleSchema } from "../handlers.js";

export const schemaTool: EdictMcpTool = {
    name: "edict_schema",
    description: "Return the JSON Schema defining valid Edict AST programs. Use format 'agent' for one-call bootstrapping (minimal schema + compact maps + builtins + effects).",
    schema: {
        format: z.enum(["full", "minimal", "compact", "agent"]).optional().default("full").describe("Schema format: 'full' (default, with descriptions), 'minimal' (stripped for token efficiency), 'compact' (compact key/kind mapping reference), or 'agent' (recommended: one-call bootstrap with minimal schema + compact maps + builtins + effects)"),
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
