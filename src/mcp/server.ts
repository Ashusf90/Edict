#!/usr/bin/env node
// =============================================================================
// Edict MCP Server — Agent interface to the Edict compiler pipeline
// =============================================================================
// Usage: tsx src/mcp/server.ts   (or: npm run mcp)
// Transport: stdio (standard for local MCP servers)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import express from "express";
import crypto from "node:crypto";
import { z } from "zod";

import {
    handleSchema,
    handleExamples,
    handleValidate,
    handleCheck,
    handleCompile,
    handleRun,
    handleVersion,
} from "./handlers.js";

// =============================================================================
// Server setup
// =============================================================================

export function createEdictServer(): McpServer {
    const server = new McpServer({
        name: "edict-compiler",
        version: "0.1.0",
    });

    // =============================================================================
    // Tools
    // =============================================================================

    // edict_schema — Return the JSON Schema for EdictModule
    server.tool(
        "edict_schema",
        {},
        async () => {
            const result = handleSchema();
            return {
                content: [{ type: "text", text: JSON.stringify(result.schema) }],
            };
        },
    );

    // edict_version — Return capability info
    server.tool(
        "edict_version",
        {},
        async () => {
            const result = handleVersion();
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                }],
            };
        },
    );

    // edict_examples — Return all example programs
    server.tool(
        "edict_examples",
        {},
        async () => {
            const result = handleExamples();
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        },
    );

    // edict_validate — Validate an AST against the JSON schema
    server.tool(
        "edict_validate",
        "Validate an Edict AST against the compiler's JSON schema without typing or compiling. Use this as a first pass.",
        {
            ast: z.any().describe("The Edict JSON AST to validate"),
        },
        async ({ ast }) => {
            const result = handleValidate(ast);
            if (result.ok) {
                return { content: [{ type: "text", text: "AST is schema-valid." }] };
            } else {
                return { content: [{ type: "text", text: JSON.stringify({ errors: result.errors }, null, 2) }], isError: true };
            }
        },
    );

    // edict_check — Type check, effect check, and verify contracts
    server.tool(
        "edict_check",
        "Run the full semantic checker (name resolution, type checking, effect checking, contract verification) on an AST.",
        {
            ast: z.any().describe("The Edict JSON AST to check"),
        },
        async ({ ast }) => {
            const result = await handleCheck(ast);
            if (result.ok) {
                return { content: [{ type: "text", text: "AST passed all semantic checks." }] };
            } else {
                return { content: [{ type: "text", text: JSON.stringify({ errors: result.errors }, null, 2) }], isError: true };
            }
        },
    );

    // edict_compile — Compile a checked AST to a base64 encoded WASM module
    server.tool(
        "edict_compile",
        "Compile a semantically valid Edict AST into a WebAssembly module. Returns the WASM binary encoded as a base64 string.",
        {
            ast: z.any().describe("The Edict JSON AST to compile"),
        },
        async ({ ast }) => {
            const result = await handleCompile(ast);
            if (result.ok && result.wasm) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            message: "Compilation successful.",
                            wasm: result.wasm,
                            binarySize: result.wasm.length, // rough estimate
                        }, null, 2),
                    }],
                };
            } else {
                return { content: [{ type: "text", text: JSON.stringify({ errors: result.errors }, null, 2) }], isError: true };
            }
        },
    );

    // edict_run — Run a base64 encoded WASM module and return its output
    server.tool(
        "edict_run",
        "Execute a compiled WebAssembly module (provided as base64) using the Edict runtime host. Returns standard output and exit code.",
        {
            wasmBase64: z.string().describe("The base64 encoded WebAssembly module to execute"),
        },
        async ({ wasmBase64 }) => {
            try {
                const result = await handleRun(wasmBase64);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    }],
                };
            } catch (err: any) {
                return {
                    content: [{ type: "text", text: String(err) }],
                    isError: true,
                };
            }
        },
    );

    // =============================================================================
    // Resources
    // =============================================================================

    server.resource(
        "schema",
        "edict://schema",
        { description: "The full JSON Schema defining valid Edict AST programs", mimeType: "application/json" },
        async () => {
            const result = handleSchema();
            return {
                contents: [{
                    uri: "edict://schema",
                    mimeType: "application/json",
                    text: JSON.stringify(result.schema, null, 2),
                }],
            };
        },
    );

    server.resource(
        "examples",
        "edict://examples",
        { description: "10 example Edict programs as JSON ASTs", mimeType: "application/json" },
        async () => {
            const result = handleExamples();
            return {
                contents: [{
                    uri: "edict://examples",
                    mimeType: "application/json",
                    text: JSON.stringify(result, null, 2),
                }],
            };
        },
    );

    return server;
}

// =============================================================================
// Start
// =============================================================================

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const useHttp = args.includes("--http") || process.env.EDICT_TRANSPORT === "http";

    // Default to port 3000 unless specified or provided in EDICT_PORT
    let port = 3000;
    if (process.env.EDICT_PORT) port = parseInt(process.env.EDICT_PORT, 10);
    const portArgIndex = args.indexOf("--port");
    if (portArgIndex !== -1 && portArgIndex + 1 < args.length) {
        port = parseInt(args[portArgIndex + 1], 10);
    }

    if (useHttp) {
        const app = createMcpExpressApp();

        // Active transports keyed by session ID
        const transports: Record<string, StreamableHTTPServerTransport> = {};

        // Need body parser for Express to handle JSON
        app.use(express.json({ limit: "50mb" }));

        app.post("/mcp", async (req: express.Request, res: express.Response) => {
            console.log("POST /mcp body:", req.body, "headers:", req.headers);
            try {
                let transport: StreamableHTTPServerTransport;
                const sessionId = req.headers["mcp-session-id"] as string | undefined;

                if (sessionId && transports[sessionId]) {
                    // Reusing existing transport
                    transport = transports[sessionId];
                } else if (req.body && req.body.method === "initialize") {
                    // New session needed
                    transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => crypto.randomUUID(),
                        onsessioninitialized: (sid) => {
                            transports[sid] = transport;
                        }
                    });

                    transport.onclose = () => {
                        const sid = transport.sessionId;
                        if (sid && transports[sid]) {
                            delete transports[sid];
                        }
                    };

                    const server = createEdictServer();
                    await server.connect(transport);
                } else {
                    res.status(400).json({
                        jsonrpc: "2.0",
                        error: { code: -32000, message: "No valid session ID provided" },
                        id: null
                    });
                    return;
                }

                await transport.handleRequest(req, res, req.body);
            } catch (err) {
                console.error("Error handling POST /mcp:", err);
                if (!res.headersSent) res.status(500).end();
            }
        });

        // GET /mcp - handles SSE streaming for responses
        app.get("/mcp", async (req: express.Request, res: express.Response) => {
            const sessionId = req.headers["mcp-session-id"] as string | undefined;
            if (!sessionId || !transports[sessionId]) {
                res.status(400).send("Invalid or missing session ID");
                return;
            }

            try {
                await transports[sessionId].handleRequest(req, res);
            } catch (err) {
                console.error("Error handling GET /mcp:", err);
                if (!res.headersSent) res.status(500).end();
            }
        });

        // DELETE /mcp - handles closing a session
        app.delete("/mcp", async (req: express.Request, res: express.Response) => {
            const sessionId = req.headers["mcp-session-id"] as string | undefined;
            if (!sessionId || !transports[sessionId]) {
                res.status(400).send("Invalid or missing session ID");
                return;
            }

            try {
                await transports[sessionId].handleRequest(req, res);
            } catch (err) {
                console.error("Error handling DELETE /mcp:", err);
                if (!res.headersSent) res.status(500).end();
            }
        });

        const serverInstance = app.listen(port, () => {
            console.log(`Edict MCP HTTP server listening on port ${port}`);
        });

        // Graceful shutdown
        process.on("SIGINT", () => {
            serverInstance.close(() => process.exit(0));
        });
        process.on("SIGTERM", () => {
            serverInstance.close(() => process.exit(0));
        });
    } else {
        // Stdio Transport
        const server = createEdictServer();
        const transport = new StdioServerTransport();
        await server.connect(transport);
    }
}

main().catch((e) => {
    console.error("Edict MCP server failed to start:", e);
    process.exit(1);
});
