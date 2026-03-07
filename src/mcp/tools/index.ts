// =============================================================================
// Tool barrel export — all declarative MCP tool definitions
// =============================================================================

import type { EdictMcpTool } from "../tool-types.js";
import { schemaTool } from "./schema.js";
import { versionTool } from "./version.js";
import { examplesTool } from "./examples.js";
import { validateTool } from "./validate.js";
import { checkTool } from "./check.js";
import { compileTool } from "./compile.js";
import { runTool } from "./run.js";
import { patchTool } from "./patch.js";
import { errorsTool } from "./errors.js";
import { lintTool } from "./lint.js";

/** All registered MCP tools. Add new tools by creating a file and adding to this array. */
export const ALL_TOOLS: EdictMcpTool[] = [
    schemaTool,
    versionTool,
    examplesTool,
    validateTool,
    checkTool,
    compileTool,
    runTool,
    patchTool,
    errorsTool,
    lintTool,
];
