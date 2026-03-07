import type { EdictMcpResource } from "../tool-types.js";
import { handleErrorCatalog } from "../handlers.js";

export const errorsResource: EdictMcpResource = {
    name: "errors",
    uri: "edict://errors",
    description: "Machine-readable catalog of all structured error types with fields, pipeline stages, and example cause/fix ASTs",
    mimeType: "application/json",
    handler: async () => {
        const result = handleErrorCatalog();
        return {
            contents: [
                {
                    uri: "edict://errors",
                    mimeType: "application/json",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
};
