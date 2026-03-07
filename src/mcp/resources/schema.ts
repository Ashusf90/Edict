import type { EdictMcpResource } from "../tool-types.js";
import { handleSchema } from "../handlers.js";

export const schemaResource: EdictMcpResource = {
    name: "schema",
    uri: "edict://schema",
    description: "The full JSON Schema defining valid Edict AST programs",
    mimeType: "application/json",
    handler: async () => {
        const result = handleSchema("full");
        return {
            contents: [
                {
                    uri: "edict://schema",
                    mimeType: "application/json",
                    text: JSON.stringify(result.schema, null, 2),
                },
            ],
        };
    },
};
