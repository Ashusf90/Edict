import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleLint } from "../handlers.js";

export const lintTool: EdictMcpTool = {
    name: "edict_lint",
    description: "Run non-blocking lint analysis on an Edict AST. Returns quality warnings (unused variables, missing contracts, oversized functions, redundant effects, etc.) without blocking compilation. Warnings use the same structured format as errors but with severity: 'warning'.",
    schema: {
        ast: z.any().describe("The Edict JSON AST to lint"),
    },
    handler: async ({ ast }) => {
        const result = handleLint(ast);
        if (!result.ok) {
            return {
                content: [
                    { type: "text" as const, text: JSON.stringify({ errors: result.errors }, null, 2) },
                ],
                isError: true,
            };
        }
        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify({ warnings: result.warnings, count: result.warnings?.length ?? 0 }, null, 2),
                },
            ],
        };
    },
};
