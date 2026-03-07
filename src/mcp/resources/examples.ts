import type { EdictMcpResource } from "../tool-types.js";
import { handleExamples } from "../handlers.js";

export const examplesResource: EdictMcpResource = {
    name: "examples",
    uri: "edict://examples",
    description: "10 example Edict programs as JSON ASTs",
    mimeType: "application/json",
    handler: async () => {
        const result = handleExamples();
        return {
            contents: [
                {
                    uri: "edict://examples",
                    mimeType: "application/json",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
};
