import { z } from "zod";
import type { EdictMcpPrompt } from "../tool-types.js";
import { promptFixError } from "../prompts.js";

export const fixErrorPrompt: EdictMcpPrompt = {
    name: "fix_error",
    description: "Prompt for fixing a structured Edict compiler error. Includes error taxonomy and fix strategy.",
    schema: { error: z.string().describe("The structured error JSON from the compiler") },
    handler: async ({ error }) => {
        return promptFixError(error);
    },
};
