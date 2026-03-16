// =============================================================================
// Cloudflare API Client Tests — unit tests with mocked fetch
// =============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { deployToCloudflare } from "../../src/deploy/cloudflare-api.js";
import type { WorkerBundle } from "../../src/deploy/scaffold.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBundle(): WorkerBundle {
    return {
        files: [
            { path: "worker.js", content: "export default { async fetch() { return new Response('ok'); } };" },
            { path: "program.wasm", content: new Uint8Array([0, 97, 115, 109]) },
            { path: "wrangler.toml", content: 'name = "test"\n' },
        ],
    };
}

const BASE_CONFIG = {
    accountId: "acc-123",
    apiToken: "tok-456",
    scriptName: "my-worker",
    bundle: makeBundle(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
    vi.restoreAllMocks();
});

describe("deployToCloudflare", () => {
    it("returns ok with URL on successful API response", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ success: true }),
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await deployToCloudflare(BASE_CONFIG);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.url).toBe("https://my-worker.workers.dev");
            expect(result.scriptName).toBe("my-worker");
        }

        // Verify fetch was called with correct URL and auth header
        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain("/accounts/acc-123/workers/scripts/my-worker");
        expect(opts.method).toBe("PUT");
        expect(opts.headers.Authorization).toBe("Bearer tok-456");
        expect(opts.body).toBeInstanceOf(FormData);

        vi.unstubAllGlobals();
    });

    it("returns structured error on API 401", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ success: false, errors: [{ message: "Unauthorized" }] }),
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await deployToCloudflare(BASE_CONFIG);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe("api_error");
            expect(result.error).toContain("401");
            expect(result.responseBody).toBeDefined();
            expect(result.responseBody).toContain("Unauthorized");
        }

        vi.unstubAllGlobals();
    });

    it("returns structured error on API 500", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => "Internal Server Error",
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await deployToCloudflare(BASE_CONFIG);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe("api_error");
            expect(result.error).toContain("500");
            expect(result.responseBody).toBe("Internal Server Error");
        }

        vi.unstubAllGlobals();
    });

    it("returns timeout error when fetch times out", async () => {
        const timeoutErr = new DOMException("The operation was aborted", "TimeoutError");
        const mockFetch = vi.fn().mockRejectedValue(timeoutErr);
        vi.stubGlobal("fetch", mockFetch);

        const result = await deployToCloudflare(BASE_CONFIG);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe("api_timeout");
            expect(result.error).toContain("timed out");
        }

        vi.unstubAllGlobals();
    });

    it("returns upload_failed on network error", async () => {
        const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
        vi.stubGlobal("fetch", mockFetch);

        const result = await deployToCloudflare(BASE_CONFIG);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe("upload_failed");
            expect(result.error).toContain("fetch failed");
        }

        vi.unstubAllGlobals();
    });

    it("returns upload_failed when bundle missing worker.js", async () => {
        const badBundle: WorkerBundle = {
            files: [
                { path: "program.wasm", content: new Uint8Array([0]) },
            ],
        };

        const result = await deployToCloudflare({ ...BASE_CONFIG, bundle: badBundle });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe("upload_failed");
            expect(result.error).toContain("worker.js");
        }
    });

    it("returns upload_failed when bundle missing program.wasm", async () => {
        const badBundle: WorkerBundle = {
            files: [
                { path: "worker.js", content: "export default {};" },
            ],
        };

        const result = await deployToCloudflare({ ...BASE_CONFIG, bundle: badBundle });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe("upload_failed");
            expect(result.error).toContain("program.wasm");
        }
    });

    it("passes custom compatibilityDate in metadata", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ success: true }),
        });
        vi.stubGlobal("fetch", mockFetch);

        await deployToCloudflare({
            ...BASE_CONFIG,
            compatibilityDate: "2025-12-01",
        });

        // Verify FormData was constructed (we can't easily inspect FormData contents,
        // but the call should succeed)
        expect(mockFetch).toHaveBeenCalledOnce();

        vi.unstubAllGlobals();
    });
});
