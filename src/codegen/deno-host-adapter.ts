// =============================================================================
// Deno Deploy Host Adapter — edge runtime adapter for Deno Deploy environment
// =============================================================================
// Implements EdictHostAdapter for Deno Deploy:
//   Crypto: pure-JS (./pure-crypto.ts) — sync, Web Crypto API is async on Deno
//   HTTP:   structured error (Deno fetch is async, unusable in sync host imports)
//   IO:    structured error (Deno.readFile is async)
//   env:   Deno.env.get() equivalent via configurable bindings

import type { EdictHostAdapter } from "./host-adapter.js";
import { sha256Bytes, md5Bytes, hmacBytes, toHex } from "./pure-crypto.js";

const encoder = new TextEncoder();

/** Options for DenoHostAdapter construction. */
export interface DenoHostAdapterOptions {
    /** Environment variable bindings. Lookups return "" for missing keys. */
    envBindings?: Record<string, string>;
}

/**
 * Deno Deploy runtime adapter.
 *
 * - Crypto: pure-JS SHA-256, MD5, HMAC (synchronous, no Web Crypto API)
 * - HTTP: returns structured error (Deno fetch is async, incompatible with sync host imports)
 * - File IO: returns structured error (Deno file APIs are async)
 * - env: configurable via constructor envBindings (maps to Deno.env.get() pattern)
 *
 * This adapter is designed for use in generated Deno Deploy scripts where WASM
 * host imports must be synchronous. All async-only operations return
 * structured errors naming the constraint.
 */
export class DenoHostAdapter implements EdictHostAdapter {
    private readonly envBindings: Record<string, string>;

    constructor(options?: DenoHostAdapterOptions) {
        this.envBindings = options?.envBindings ?? {};
    }

    // ── Crypto ──────────────────────────────────────────────────────────

    sha256(data: string): string {
        return toHex(sha256Bytes(encoder.encode(data)));
    }

    md5(data: string): string {
        return toHex(md5Bytes(encoder.encode(data)));
    }

    hmac(algo: string, key: string, data: string): string {
        const result = hmacBytes(algo, encoder.encode(key), encoder.encode(data));
        return result ? toHex(result) : "";
    }

    // ── HTTP ────────────────────────────────────────────────────────────

    fetch(_url: string, _method: string, _body?: string): { ok: boolean; data: string } {
        // Deno fetch() is async — can't be called from synchronous WASM host imports.
        return { ok: false, data: "fetch_not_available_sync" };
    }

    // ── IO ──────────────────────────────────────────────────────────────

    readFile(_path: string): { ok: false; error: string } {
        // Deno file APIs are async — can't be called from synchronous WASM host imports.
        return { ok: false, error: "deno_fs_not_available_sync" };
    }

    writeFile(_path: string, _content: string): { ok: false; error: string } {
        // Deno file APIs are async — can't be called from synchronous WASM host imports.
        return { ok: false, error: "deno_fs_not_available_sync" };
    }

    env(name: string): string {
        return Object.hasOwn(this.envBindings, name) ? this.envBindings[name]! : "";
    }

    args(): string[] {
        return [];
    }

    exit(code: number): never {
        throw new Error(`edict_exit:${code}`);
    }
}
