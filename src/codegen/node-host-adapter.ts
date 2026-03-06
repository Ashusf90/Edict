// =============================================================================
// Node.js Host Adapter — platform-specific operations for Node.js runtime
// =============================================================================
// Extracted from the monolithic host-functions.ts. Uses Node.js APIs:
// - node:crypto   (createHash, createHmac)
// - node:child_process (execFileSync for sync HTTP)
// - node:fs       (readFileSync, writeFileSync)
// - node:path     (resolve)

import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import type { EdictHostAdapter } from "./host-adapter.js";

/** Max response body size (1 MB) — prevents WASM memory overflow. */
const HTTP_MAX_RESPONSE_BYTES = 1_048_576;

/** Max file size (1 MB) — prevents WASM memory overflow. */
const IO_MAX_FILE_BYTES = 1_048_576;

/**
 * Validate that a resolved path is inside the sandbox directory.
 * Returns the resolved absolute path on success, or an error string.
 */
function validateSandboxPath(rawPath: string, sandboxDir: string): { ok: true; path: string } | { ok: false; error: string } {
    const resolved = pathResolve(sandboxDir, rawPath);
    if (!resolved.startsWith(sandboxDir)) {
        return { ok: false, error: `path_outside_sandbox: ${rawPath}` };
    }
    return { ok: true, path: resolved };
}

/**
 * Perform a synchronous HTTP request by spawning a child Node process.
 * Returns `{ok, data}` — ok=true for 2xx responses, ok=false for errors.
 */
function syncFetch(url: string, method: string, body?: string): { ok: boolean; data: string } {
    const script = `
        (async () => {
            try {
                const url = process.env.__EDICT_URL;
                const method = process.env.__EDICT_METHOD;
                const body = process.env.__EDICT_BODY;
                const opts = { method };
                if (body !== undefined && body !== "") {
                    opts.headers = {"Content-Type": "application/json"};
                    opts.body = body;
                }
                const res = await fetch(url, opts);
                let text = await res.text();
                if (text.length > ${HTTP_MAX_RESPONSE_BYTES}) text = text.slice(0, ${HTTP_MAX_RESPONSE_BYTES});
                if (!res.ok) {
                    process.stdout.write(JSON.stringify({ok: false, data: res.status + " " + text}));
                } else {
                    process.stdout.write(JSON.stringify({ok: true, data: text}));
                }
            } catch (e) {
                process.stdout.write(JSON.stringify({ok: false, data: e.message || String(e)}));
            }
        })();
    `;

    const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        __EDICT_URL: url,
        __EDICT_METHOD: method,
    };
    if (body !== undefined) {
        env.__EDICT_BODY = body;
    }

    try {
        const stdout = execFileSync(process.execPath, ["-e", script], {
            timeout: 10_000,
            env,
            maxBuffer: HTTP_MAX_RESPONSE_BYTES + 1024, // room for JSON framing
        });
        return JSON.parse(stdout.toString("utf-8"));
    } catch {
        return { ok: false, data: "Request timed out or process error" };
    }
}

/**
 * Node.js implementation of the Edict host adapter.
 *
 * Uses Node.js-specific APIs for crypto, HTTP, and filesystem operations.
 * This is the default adapter used when no adapter is explicitly specified.
 */
export class NodeHostAdapter implements EdictHostAdapter {
    private readonly sandboxDir?: string;

    constructor(sandboxDir?: string) {
        this.sandboxDir = sandboxDir;
    }

    // ── Crypto ──────────────────────────────────────────────────────────

    sha256(data: string): string {
        return createHash("sha256").update(data).digest("hex");
    }

    md5(data: string): string {
        return createHash("md5").update(data).digest("hex");
    }

    hmac(algo: string, key: string, data: string): string {
        try {
            return createHmac(algo, key).update(data).digest("hex");
        } catch {
            return ""; // invalid algorithm → empty string
        }
    }

    // ── HTTP ────────────────────────────────────────────────────────────

    fetch(url: string, method: string, body?: string): { ok: boolean; data: string } {
        return syncFetch(url, method, body);
    }

    // ── IO ──────────────────────────────────────────────────────────────

    readFile(path: string): { ok: true; data: string } | { ok: false; error: string } {
        if (!this.sandboxDir) {
            return { ok: false, error: "filesystem_not_configured" };
        }
        const validation = validateSandboxPath(path, this.sandboxDir);
        if (!validation.ok) {
            return { ok: false, error: validation.error };
        }
        try {
            let content = readFileSync(validation.path, "utf-8");
            if (content.length > IO_MAX_FILE_BYTES) {
                content = content.slice(0, IO_MAX_FILE_BYTES);
            }
            return { ok: true, data: content };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: msg };
        }
    }

    writeFile(path: string, content: string): { ok: true } | { ok: false; error: string } {
        if (!this.sandboxDir) {
            return { ok: false, error: "filesystem_not_configured" };
        }
        const validation = validateSandboxPath(path, this.sandboxDir);
        if (!validation.ok) {
            return { ok: false, error: validation.error };
        }
        try {
            writeFileSync(validation.path, content, "utf-8");
            return { ok: true };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: msg };
        }
    }

    env(name: string): string {
        return process.env[name] ?? "";
    }

    args(): string[] {
        return process.argv.slice(2);
    }

    exit(code: number): never {
        throw new Error(`edict_exit:${code}`);
    }
}
