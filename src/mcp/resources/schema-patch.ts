import type { EdictMcpResource } from "../tool-types.js";
import { handlePatchSchema } from "../handlers.js";

export const schemaPatchResource: EdictMcpResource = {
    name: "schema-patch",
    uri: "edict://schema/patch",
    description: "JSON Schema defining the AST diff/patch protocol for the edict_patch tool (replace, insert, delete operations)",
    mimeType: "application/json",
    handler: async () => {
        const schema = handlePatchSchema();
        return {
            contents: [
                {
                    uri: "edict://schema/patch",
                    mimeType: "application/json",
                    text: JSON.stringify(schema, null, 2),
                },
            ],
        };
    },
};
