import { z } from "zod";
import type { EdictMcpPrompt } from "../tool-types.js";
import { promptAddContracts } from "../prompts.js";

export const addContractsPrompt: EdictMcpPrompt = {
    name: "add_contracts",
    description: "Prompt for adding pre/postcondition contracts to existing Edict functions for Z3 formal verification.",
    schema: { ast: z.string().describe("The Edict JSON AST to add contracts to") },
    handler: async ({ ast }) => {
        return promptAddContracts(ast);
    },
};
