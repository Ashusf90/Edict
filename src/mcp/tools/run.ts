import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleRun } from "../handlers.js";

export const runTool: EdictMcpTool = {
    name: "edict_run",
    description: "Execute a compiled WebAssembly module (provided as base64) in a sandboxed runtime. The WASM VM has no ambient authority — filesystem, network, and crypto access are provided exclusively through host adapters. Returns standard output, exit code, and any sandbox limit errors. Supports optional execution limits (timeout, memory, sandbox directory).",
    schema: {
        wasmBase64: z.string().describe("The base64 encoded WebAssembly module to execute"),
        limits: z.object({
            timeoutMs: z.number().optional().describe("Max execution time in milliseconds (default: 15000, min: 100)"),
            maxMemoryMb: z.number().optional().describe("Max WASM memory in MB (compile-time limit, default: 1)"),
        }).optional().describe("Optional execution sandbox limits"),
    },
    handler: async ({ wasmBase64, limits }) => {
        try {
            const result = await handleRun(wasmBase64, limits);
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
