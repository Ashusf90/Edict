import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleReplay } from "../handlers.js";

export const replayTool: EdictMcpTool = {
    name: "edict_replay",
    description: "Re-execute a WASM module using a previously recorded replay token for deterministic reproduction of runtime behavior. All non-deterministic host responses (random values, timestamps, HTTP responses, file IO) are replayed from the token instead of calling real host functions. Use this to reproduce exact failures or verify fixes against known execution traces.",
    schema: {
        wasmBase64: z.string().describe("The base64 encoded WebAssembly module to execute"),
        replayToken: z.object({
            responses: z.array(z.object({
                kind: z.string(),
                args: z.array(z.unknown()),
                result: z.unknown(),
            })),
            recordedAt: z.string(),
        }).describe("Replay token from a previous edict_run call with record: true"),
        limits: z.object({
            timeoutMs: z.number().optional().describe("Max execution time in milliseconds (default: 15000, min: 100)"),
        }).optional().describe("Optional execution limits"),
    },
    handler: async ({ wasmBase64, replayToken, limits }) => {
        try {
            const result = await handleReplay(wasmBase64, replayToken, limits);
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
