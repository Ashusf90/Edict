import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleCompile } from "../handlers.js";

export const compileTool: EdictMcpTool = {
    name: "edict_compile",
    description: "Compile a semantically valid Edict AST into a WebAssembly module. Returns the WASM binary encoded as a base64 string.",
    schema: {
        ast: z.any().describe("The Edict JSON AST to compile"),
    },
    handler: async ({ ast }) => {
        const result = await handleCompile(ast);
        if (result.ok && result.wasm) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                message: "Compilation successful.",
                                wasm: result.wasm,
                                binarySize: result.wasm.length,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        } else {
            return {
                content: [
                    { type: "text" as const, text: JSON.stringify({ errors: result.errors }, null, 2) },
                ],
                isError: true,
            };
        }
    },
};
