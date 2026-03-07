import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handlePatch } from "../handlers.js";

export const patchTool: EdictMcpTool = {
    name: "edict_patch",
    description: "Apply surgical patches to an Edict AST by nodeId, then run the full check pipeline. Use this to fix errors without resubmitting the entire AST. Each patch specifies a nodeId, an operation (replace/delete/insert), and the relevant field/value.",
    schema: {
        ast: z.any().describe("The base Edict JSON AST to patch"),
        patches: z.array(z.object({
            nodeId: z.string().describe("ID of the target AST node"),
            op: z.enum(["replace", "delete", "insert"]).describe("Operation: replace a field, delete a node, or insert into an array"),
            field: z.string().optional().describe("Field name (required for replace/insert)"),
            value: z.any().optional().describe("New value (required for replace/insert)"),
            index: z.number().optional().describe("Array index for insert (defaults to end)"),
        })).describe("Array of patches to apply"),
        returnAst: z.boolean().optional().default(false).describe("Include the patched AST in the response (costs tokens, off by default)"),
    },
    handler: async ({ ast, patches, returnAst }) => {
        const result = await handlePatch(ast, patches, returnAst);
        if (result.ok) {
            const response: Record<string, unknown> = { ok: true };
            if (result.patchedAst) response.patchedAst = result.patchedAst;
            return {
                content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
            };
        } else {
            return {
                content: [
                    { type: "text" as const, text: JSON.stringify({ errors: result.errors }, null, 2) },
                ],
                isError: true,
            };
        }
    },
};
