import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleDebug } from "../handlers.js";

export const debugTool: EdictMcpTool = {
    name: "edict_debug",
    description: "Execute an Edict program with debug instrumentation. Compiles the AST with call-stack tracing, runs it, and returns structured crash diagnostics including call stack at crash time, crash location with nodeId, and step count. Use this instead of edict_compile + edict_run when debugging runtime failures — the crash location and call stack enable targeted fixes without guessing.",
    schema: {
        ast: z.unknown().describe("The Edict program AST (module) to debug — same format as edict_compile"),
        options: z.object({
            maxSteps: z.number().optional().describe("Maximum function entries before stopping execution (default: 10000). Prevents infinite loops from consuming resources."),
        }).optional().describe("Optional debug execution options"),
    },
    handler: async ({ ast, options }) => {
        try {
            const result = await handleDebug(ast, options);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        } catch (err: unknown) {
            return {
                content: [{ type: "text" as const, text: String(err) }],
                isError: true,
            };
        }
    },
};
