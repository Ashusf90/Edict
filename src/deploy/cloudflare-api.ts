// =============================================================================
// Cloudflare Workers API Client — deploy WASM bundles to Cloudflare Workers
// =============================================================================
// Uses the Cloudflare Workers Script API to upload a Worker bundle generated
// by the scaffold generator. Zero external dependencies — Node fetch only.
//
// API reference: PUT /client/v4/accounts/{account_id}/workers/scripts/{script_name}
// Docs: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/

import type { WorkerBundle } from "./scaffold.js";

// =============================================================================
// Types
// =============================================================================

/** Configuration for deploying a Worker to Cloudflare. */
export interface CloudflareDeployConfig {
    /** Cloudflare account ID. */
    accountId: string;
    /** Cloudflare API token with Workers write permission. */
    apiToken: string;
    /** Worker script name — used in the deployment URL. */
    scriptName: string;
    /** Worker bundle from the scaffold generator. */
    bundle: WorkerBundle;
    /** Wrangler compatibility date (default: "2024-01-01"). */
    compatibilityDate?: string;
}

/** Result of a Cloudflare Workers deployment. */
export type CloudflareDeployResult =
    | { ok: true; url: string; scriptName: string }
    | { ok: false; error: string; code: string; responseBody?: string };

// =============================================================================
// Constants
// =============================================================================

const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const DEPLOY_TIMEOUT_MS = 30_000;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Deploy a Worker bundle to Cloudflare Workers via the Workers Script API.
 *
 * Uploads the bundle as a multipart form:
 * - metadata part: JSON with `main_module` and `compatibility_date`
 * - worker.js part: ES Module Worker entry point
 * - program.wasm part: compiled WASM binary
 *
 * @param config - Deploy configuration including credentials and bundle
 * @returns Structured deploy result with URL on success, error code on failure
 */
export async function deployToCloudflare(
    config: CloudflareDeployConfig,
): Promise<CloudflareDeployResult> {
    const { accountId, apiToken, scriptName, bundle, compatibilityDate } = config;

    // Find worker.js and program.wasm in bundle
    const workerFile = bundle.files.find(f => f.path === "worker.js");
    const wasmFile = bundle.files.find(f => f.path === "program.wasm");

    if (!workerFile || typeof workerFile.content !== "string") {
        return { ok: false, error: "Bundle missing worker.js", code: "upload_failed" };
    }
    if (!wasmFile || !(wasmFile.content instanceof Uint8Array)) {
        return { ok: false, error: "Bundle missing program.wasm", code: "upload_failed" };
    }

    // Build multipart form data
    const formData = new FormData();

    // Metadata part — tells Cloudflare which file is the main module
    const metadata = {
        main_module: "worker.js",
        compatibility_date: compatibilityDate ?? "2024-01-01",
    };
    formData.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );

    // Worker.js as ES module
    formData.append(
        "worker.js",
        new Blob([workerFile.content], { type: "application/javascript+module" }),
        "worker.js",
    );

    // program.wasm as compiled WASM module
    const wasmBytes = new Uint8Array(wasmFile.content);
    formData.append(
        "program.wasm",
        new Blob([wasmBytes], { type: "application/wasm" }),
        "program.wasm",
    );

    // Upload via Workers Script API
    const url = `${CF_API_BASE}/accounts/${accountId}/workers/scripts/${scriptName}`;

    try {
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${apiToken}`,
            },
            body: formData,
            signal: AbortSignal.timeout(DEPLOY_TIMEOUT_MS),
        });

        const responseBody = await response.text();

        if (response.ok) {
            return {
                ok: true,
                url: `https://${scriptName}.workers.dev`,
                scriptName,
            };
        }

        return {
            ok: false,
            error: `Cloudflare API returned ${response.status}`,
            code: "api_error",
            responseBody,
        };
    } catch (err: unknown) {
        // Timeout detection
        if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
            return {
                ok: false,
                error: `Deploy timed out after ${DEPLOY_TIMEOUT_MS}ms`,
                code: "api_timeout",
            };
        }

        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            error: `Deploy failed: ${message}`,
            code: "upload_failed",
        };
    }
}
