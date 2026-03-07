import type { EdictMcpTool } from "../tool-types.js";
import { handleVersion } from "../handlers.js";

export const versionTool: EdictMcpTool = {
    name: "edict_version",
    schema: {},
    handler: async () => {
        const result = handleVersion();
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
