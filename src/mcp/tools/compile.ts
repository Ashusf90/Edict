import { z } from "zod";
import type { EdictMcpTool } from "../tool-types.js";
import { handleCompile, handleCompileMulti } from "../handlers.js";

export const compileTool: EdictMcpTool = {
    name: "edict_compile",
    description: "Compile a semantically valid Edict AST into a WebAssembly module. Returns the WASM binary encoded as a base64 string. Supports single module (ast) or multi-module (modules array) input.",
    schema: {
        ast: z.any().optional().describe("The Edict JSON AST to compile (single module)"),
        modules: z.array(z.any()).optional().describe("Array of Edict module ASTs to compile together (multi-module). Cross-module imports are resolved automatically."),
    },
    handler: async ({ ast, modules }) => {
        const result = modules
            ? await handleCompileMulti(modules)
            : await handleCompile(ast);
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
