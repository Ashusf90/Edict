// =============================================================================
// Replay Host Adapter — plays back recorded adapter responses
// =============================================================================
// Implements EdictHostAdapter by reading from a ReplayToken's response queue.
// Returns a structured error if the token runs out of recorded responses.

import type { EdictHostAdapter } from "./host-adapter.js";
import type { ReplayEntry } from "./replay-types.js";

/** Error thrown when replay token runs out of recorded responses. */
export class ReplayExhaustedError extends Error {
    constructor(public expectedKind: string, public position: number) {
        super(`replay_token_exhausted: expected "${expectedKind}" at position ${position}`);
    }
}

/**
 * Create a replay adapter that returns pre-recorded responses.
 *
 * Each adapter method call pops the next entry from the cursor and returns
 * its recorded result. Throws ReplayExhaustedError if the queue runs out.
 *
 * @param entries - The recorded entries from a ReplayToken
 * @param cursor - Shared cursor object (mutated to track position)
 */
export function createReplayAdapter(
    entries: ReplayEntry[],
    cursor: { i: number },
): EdictHostAdapter {
    function nextEntry(expectedKind: string): ReplayEntry {
        if (cursor.i >= entries.length) {
            throw new ReplayExhaustedError(expectedKind, cursor.i);
        }
        const entry = entries[cursor.i]!;
        cursor.i++;
        return entry;
    }

    return {
        sha256(_data: string): string {
            // Crypto is deterministic — delegate to real implementation
            // But during replay we don't have the real adapter, so replay from token
            const entry = nextEntry("sha256");
            return entry.result as string;
        },
        md5(_data: string): string {
            const entry = nextEntry("md5");
            return entry.result as string;
        },
        hmac(_algo: string, _key: string, _data: string): string {
            const entry = nextEntry("hmac");
            return entry.result as string;
        },
        fetch(_url: string, _method: string, _body?: string): { ok: boolean; data: string } {
            const entry = nextEntry("fetch");
            return entry.result as { ok: boolean; data: string };
        },
        readFile(_path: string): { ok: true; data: string } | { ok: false; error: string } {
            const entry = nextEntry("readFile");
            return entry.result as { ok: true; data: string } | { ok: false; error: string };
        },
        writeFile(_path: string, _content: string): { ok: true } | { ok: false; error: string } {
            const entry = nextEntry("writeFile");
            return entry.result as { ok: true } | { ok: false; error: string };
        },
        env(_name: string): string {
            const entry = nextEntry("env");
            return entry.result as string;
        },
        args(): string[] {
            const entry = nextEntry("args");
            return entry.result as string[];
        },
        exit(code: number): never {
            // exit() throws — it won't have a recorded result.
            // Re-throw the same exit signal the runner catches.
            throw new Error(`edict_exit:${code}`);
        },
    };
}
