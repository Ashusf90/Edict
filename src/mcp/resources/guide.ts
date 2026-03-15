// =============================================================================
// MCP Resource: edict://guide — agent bootstrap guide
// =============================================================================

import type { EdictMcpResource } from "../tool-types.js";
import { buildAgentGuide } from "../agent-guide.js";

export const guideResource: EdictMcpResource = {
    name: "guide",
    uri: "edict://guide",
    description: "Agent bootstrap guide — workflow, template, error recovery, builtins, tool reference",
    mimeType: "application/json",
    handler: async () => ({
        contents: [{
            uri: "edict://guide",
            mimeType: "application/json",
            text: JSON.stringify(buildAgentGuide()),
        }],
    }),
};
