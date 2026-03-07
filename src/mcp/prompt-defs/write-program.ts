import { z } from "zod";
import type { EdictMcpPrompt } from "../tool-types.js";
import { promptWriteProgram } from "../prompts.js";

export const writeProgramPrompt: EdictMcpPrompt = {
    name: "write_program",
    description: "System prompt for writing a new Edict program from a task description. Includes minimal schema, example, and builtin list.",
    schema: { task: z.string().describe("Description of what the program should do") },
    handler: async ({ task }) => {
        return promptWriteProgram(task);
    },
};
