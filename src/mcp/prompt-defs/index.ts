// =============================================================================
// Prompt barrel export — all declarative MCP prompt definitions
// =============================================================================

import type { EdictMcpPrompt } from "../tool-types.js";
import { writeProgramPrompt } from "./write-program.js";
import { fixErrorPrompt } from "./fix-error.js";
import { addContractsPrompt } from "./add-contracts.js";
import { reviewAstPrompt } from "./review-ast.js";

/** All registered MCP prompts. Add new prompts by creating a file and adding to this array. */
export const ALL_PROMPTS: EdictMcpPrompt[] = [
    writeProgramPrompt,
    fixErrorPrompt,
    addContractsPrompt,
    reviewAstPrompt,
];
