import type { EdictMcpResource } from "../tool-types.js";
import { handleSchema } from "../handlers.js";

export const schemaMinimalResource: EdictMcpResource = {
    name: "schema-minimal",
    uri: "edict://schema/minimal",
    description: "Token-optimized JSON Schema (descriptions stripped) for minimal context window usage",
    mimeType: "application/json",
    handler: async () => {
        const result = handleSchema("minimal");
        return {
            contents: [
                {
                    uri: "edict://schema/minimal",
                    mimeType: "application/json",
                    text: JSON.stringify(result.schema, null, 2),
                },
            ],
        };
    },
};
