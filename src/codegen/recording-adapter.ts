// =============================================================================
// Recording Host Adapter — Proxy-based automatic interception
// =============================================================================
// Wraps any EdictHostAdapter with a JS Proxy that records ALL method calls.
// Zero manual method listing: new adapter methods are automatically recorded.

import type { EdictHostAdapter } from "./host-adapter.js";
import type { ReplayEntry } from "./replay-types.js";

/**
 * Create a recording proxy around any EdictHostAdapter.
 *
 * Every method call is intercepted, its arguments and return value logged
 * to the provided entries array. The proxy is transparent — the underlying
 * adapter executes normally.
 *
 * @param inner - The real adapter to wrap (e.g., NodeHostAdapter)
 * @param entries - Mutable array where recorded entries are appended
 */
export function createRecordingAdapter(
    inner: EdictHostAdapter,
    entries: ReplayEntry[],
): EdictHostAdapter {
    return new Proxy(inner, {
        get(target, prop, receiver) {
            const original = Reflect.get(target, prop, receiver);
            if (typeof original !== "function") return original;
            return (...args: unknown[]) => {
                const result = (original as Function).apply(target, args);
                entries.push({ kind: String(prop), args, result });
                return result;
            };
        },
    });
}
