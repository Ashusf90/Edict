// =============================================================================
// MCP Support Handler Tests — tool + resource wrappers
// =============================================================================

import { describe, it, expect } from "vitest";
import { supportTool } from "../../src/mcp/tools/support.js";
import { supportResource } from "../../src/mcp/resources/support.js";

describe("supportTool wrapper", () => {
    it("returns structured sponsorship info", () => {
        const result = supportTool.handler({});
        const parsed = JSON.parse((result.content[0] as any).text);
        expect(parsed).toHaveProperty("project", "Edict");
        expect(parsed).toHaveProperty("links");
        expect(parsed).toHaveProperty("actions");
    });
});

describe("supportResource wrapper", () => {
    it("returns resource contents with sponsorship info", async () => {
        const result = await supportResource.handler();
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].uri).toBe("edict://support");
        expect(result.contents[0].mimeType).toBe("application/json");
        const parsed = JSON.parse(result.contents[0].text as string);
        expect(parsed).toHaveProperty("project", "Edict");
        expect(parsed).toHaveProperty("links");
    });
});
