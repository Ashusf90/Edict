import type { EdictMcpTool } from "../tool-types.js";
import { handleErrorCatalog } from "../handlers.js";

export const errorsTool: EdictMcpTool = {
    name: "edict_errors",
    schema: {},
    handler: async () => {
        const result = handleErrorCatalog();
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
