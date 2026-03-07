// =============================================================================
// Declarative MCP registration types
// =============================================================================
// Shared interfaces for defining MCP tools, resources, and prompts as
// declarative objects. Used by create-server.ts to auto-register from
// barrel exports.

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Declarative MCP tool definition */
export interface EdictMcpTool {
    name: string;
    description?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (args: any, extra: any) => CallToolResult | Promise<CallToolResult>;
}

/** Declarative MCP resource definition */
export interface EdictMcpResource {
    name: string;
    uri: string;
    description: string;
    mimeType: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (uri: URL, extra: any) => Promise<any>;
}

/** Declarative MCP prompt definition */
export interface EdictMcpPrompt {
    name: string;
    description: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (args: any, extra: any) => Promise<any>;
}
