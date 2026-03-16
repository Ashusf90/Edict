import { describe, it, expect } from "vitest";
import { guideResource } from "../../src/mcp/resources/guide.js";

describe("guideResource", () => {
  it("returns a valid MCP resource response", async () => {
    const result = await guideResource.handler();

    expect(result).toBeDefined();
    expect(result.contents).toBeDefined();
    expect(result.contents.length).toBeGreaterThan(0);

    const content = result.contents[0];

    expect(content.uri).toBe("edict://guide");
    expect(content.mimeType).toBe("application/json");

    expect(() => JSON.parse(content.text)).not.toThrow();
  });
});
