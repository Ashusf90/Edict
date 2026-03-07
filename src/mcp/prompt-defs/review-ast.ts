import { z } from "zod";
import type { EdictMcpPrompt } from "../tool-types.js";
import { promptReviewAst } from "../prompts.js";

export const reviewAstPrompt: EdictMcpPrompt = {
    name: "review_ast",
    description: "Prompt for reviewing an Edict AST for quality issues (unused variables, missing effects, dead code, etc.).",
    schema: { ast: z.string().describe("The Edict JSON AST to review") },
    handler: async ({ ast }) => {
        return promptReviewAst(ast);
    },
};
