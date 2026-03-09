import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleExplain } from "../handlers.js";

export const explainTool: EdictMcpTool = {
    name: "edict_explain",
    description:
        "Given a structured error, returns enriched repair context: pipeline stage, field metadata, example ASTs, and repair strategy.",
    schema: {
        error: z.any().describe("A structured error object from the compiler (must have an 'error' discriminator field)"),
    },
    handler: async ({ error }) => {
        const result = handleExplain(error);
        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
};
