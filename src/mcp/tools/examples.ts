import type { EdictMcpTool } from "../tool-types.js";
import { handleExamples } from "../handlers.js";

export const examplesTool: EdictMcpTool = {
    name: "edict_examples",
    schema: {},
    handler: async () => {
        const result = handleExamples();
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    },
};
