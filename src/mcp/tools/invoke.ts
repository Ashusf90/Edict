import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleInvoke } from "../handlers.js";

export const invokeTool: EdictMcpTool = {
    name: "edict_invoke",
    description: "Invoke a deployed Edict WASM service via HTTP. Sends a request to the given URL with optional input and returns the structured result. Completes the deploy → invoke round-trip.",
    schema: {
        url: z.string().describe("URL of the deployed Edict service to invoke"),
        input: z.string().optional().describe("Request body to send to the service"),
        method: z.string().optional().describe("HTTP method (default: POST)"),
        timeoutMs: z.number().optional().describe("Request timeout in milliseconds (default: 10000)"),
        headers: z.record(z.string(), z.string()).optional().describe("Additional HTTP headers to send"),
    },
    handler: async ({ url, input, method, timeoutMs, headers }) => {
        const options = { method, timeoutMs, headers };
        const result = await handleInvoke(url, input, options);
        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify(result, null, 2),
                },
            ],
            isError: !result.ok,
        };
    },
};
