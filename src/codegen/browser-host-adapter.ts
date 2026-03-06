// =============================================================================
// Browser Host Adapter — stub for browser/edge runtimes
// =============================================================================
// Demonstrates the adapter pattern for non-Node environments.
// Operations that require Node-specific APIs return structured errors
// instead of crashing. Full browser support (async crypto, async fetch)
// is a separate issue.

import type { EdictHostAdapter } from "./host-adapter.js";

/**
 * Browser/edge runtime adapter stub.
 *
 * Provides meaningful error responses for operations that aren't available
 * in browser environments (sync fetch, filesystem) while maintaining the
 * adapter contract.
 */
export class BrowserHostAdapter implements EdictHostAdapter {
    // ── Crypto ──────────────────────────────────────────────────────────
    // Web Crypto API (crypto.subtle) is async-only. These synchronous
    // methods can't use it without an async execution model.

    sha256(_data: string): string {
        throw new Error("not_supported: sha256 requires async crypto.subtle in browser");
    }

    md5(_data: string): string {
        throw new Error("not_supported: md5 not available in Web Crypto API");
    }

    hmac(_algo: string, _key: string, _data: string): string {
        throw new Error("not_supported: hmac requires async crypto.subtle in browser");
    }

    // ── HTTP ────────────────────────────────────────────────────────────
    // Browser fetch is async-only. Synchronous XHR is deprecated.

    fetch(_url: string, _method: string, _body?: string): { ok: boolean; data: string } {
        throw new Error("not_supported: synchronous fetch not available in browser");
    }

    // ── IO ──────────────────────────────────────────────────────────────
    // No filesystem access in browser environments.

    readFile(_path: string): { ok: false; error: string } {
        return { ok: false, error: "filesystem_not_available" };
    }

    writeFile(_path: string, _content: string): { ok: false; error: string } {
        return { ok: false, error: "filesystem_not_available" };
    }

    env(_name: string): string {
        return "";
    }

    args(): string[] {
        return [];
    }

    exit(code: number): never {
        throw new Error(`edict_exit:${code}`);
    }
}
