// =============================================================================
// Host Function Imports — WASM ↔ Host bridge for Edict runtime
// =============================================================================
// All host functions that WASM modules import are defined here.
// The runner calls `createHostImports()` and passes the result as the
// import object to `WebAssembly.instantiate()`.
//
// Platform-agnostic groups (string, math, array, etc.) use Web Standard APIs.
// Platform-specific groups (crypto, HTTP, IO) delegate to an EdictHostAdapter.

import type { EdictHostAdapter } from "./host-adapter.js";
import { NodeHostAdapter } from "./node-host-adapter.js";

// =============================================================================
// Shared runtime state — passed between host functions via closure
// =============================================================================

/** Mutable runtime state shared by all host functions during one execution. */
export interface RuntimeState {
    /** Captured stdout output parts. */
    outputParts: string[];
    /** Late-bound WASM instance — set after instantiation. */
    instance: WasmInstance | null;
    /** Optional sandbox directory for file IO. If unset, readFile/writeFile return Err. */
    sandboxDir?: string;
}

interface WasmInstance {
    readonly exports: {
        [key: string]: unknown;
        memory?: { readonly buffer: ArrayBuffer };
    };
}

/** Typed error thrown when a host-side heap allocation exceeds WASM memory bounds. */
export class EdictOomError extends Error {
    constructor(public heapUsed: number, public heapLimit: number) {
        super("edict_oom: heap exhausted");
    }
}

// =============================================================================
// Memory helpers
// =============================================================================

function getMemoryBuffer(state: RuntimeState): ArrayBuffer {
    return (state.instance!.exports.memory as { buffer: ArrayBuffer }).buffer;
}

/**
 * Centralized heap allocator with bounds checking.
 * Allocates `size` bytes (8-byte aligned) from the bump allocator,
 * throwing EdictOomError if the allocation would exceed WASM memory.
 */
function allocateHeap(state: RuntimeState, size: number): number {
    const getHeapPtr = state.instance!.exports.__get_heap_ptr as () => number;
    const setHeapPtr = state.instance!.exports.__set_heap_ptr as (v: number) => void;
    const ptr = getHeapPtr();
    const aligned = Math.ceil(size / 8) * 8;
    const newPtr = ptr + aligned;
    const memorySize = getMemoryBuffer(state).byteLength;
    if (newPtr > memorySize) {
        throw new EdictOomError(ptr, memorySize);
    }
    setHeapPtr(newPtr);
    return ptr;
}

/**
 * Write a string result into WASM memory at __heap_ptr,
 * advance __heap_ptr (8-byte aligned), set __str_ret_len, and return ptr.
 */
function writeStringResult(state: RuntimeState, str: string, encoder: TextEncoder): number {
    const encoded = encoder.encode(str);
    const resultPtr = allocateHeap(state, encoded.length);
    const dest = new Uint8Array(getMemoryBuffer(state), resultPtr, encoded.length);
    dest.set(encoded);
    const setStrRetLen = state.instance!.exports.__set_str_ret_len as (v: number) => void;
    setStrRetLen(encoded.length);
    return resultPtr;
}

/**
 * Allocate a new array on the WASM heap: [length: i32][elem0: i32]...
 * Advances __heap_ptr (8-byte aligned) and returns the new array pointer.
 */
function writeArrayResult(state: RuntimeState, elements: number[]): number {
    const totalSize = 4 + elements.length * 4; // header + elements
    const resultPtr = allocateHeap(state, totalSize);
    const view = new DataView(getMemoryBuffer(state));
    view.setInt32(resultPtr, elements.length, true); // write length
    for (let i = 0; i < elements.length; i++) {
        view.setInt32(resultPtr + 4 + i * 4, elements[i]!, true);
    }
    return resultPtr;
}

/**
 * Allocate a Result value on the WASM heap: [tag: i32][pad(4)][value: i32][pad(4)]
 * tag=0 means Ok, tag=1 means Err. Total size = 16 bytes (matches enum layout).
 * Returns the pointer to the Result pair.
 */
function writeResultValue(state: RuntimeState, tag: number, value: number): number {
    const ptr = allocateHeap(state, 16);
    const view = new DataView(getMemoryBuffer(state));
    view.setInt32(ptr, tag, true);      // tag at offset 0
    view.setInt32(ptr + 8, value, true); // value at offset 8 (matches EnumVariantLayout)
    return ptr;
}

// =============================================================================
// Core host functions (print, string_replace)
// =============================================================================

function createCoreImports(state: RuntimeState): Record<string, Function> {
    return {
        print: (ptr: number, len: number): number => {
            const bytes = new Uint8Array(getMemoryBuffer(state), ptr, len);
            const text = new TextDecoder().decode(bytes);
            state.outputParts.push(text);
            return ptr;
        },
        string_replace: (
            hayPtr: number, hayLen: number,
            needlePtr: number, needleLen: number,
            replPtr: number, replLen: number,
        ): number => {
            const memoryBuffer = getMemoryBuffer(state);
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();
            const haystack = decoder.decode(new Uint8Array(memoryBuffer, hayPtr, hayLen));
            const needle = decoder.decode(new Uint8Array(memoryBuffer, needlePtr, needleLen));
            const replacement = decoder.decode(new Uint8Array(memoryBuffer, replPtr, replLen));
            return writeStringResult(state, haystack.replaceAll(needle, replacement), encoder);
        },
    };
}

// =============================================================================
// String builtins
// =============================================================================

function createStringImports(state: RuntimeState): Record<string, Function> {
    return {
        string_length: (ptr: number, len: number): number => {
            const str = new TextDecoder().decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            return str.length;
        },
        substring: (ptr: number, len: number, start: number, end: number): number => {
            const str = new TextDecoder().decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            return writeStringResult(state, str.substring(start, end), new TextEncoder());
        },
        string_concat: (aPtr: number, aLen: number, bPtr: number, bLen: number): number => {
            const decoder = new TextDecoder();
            const buf = getMemoryBuffer(state);
            const a = decoder.decode(new Uint8Array(buf, aPtr, aLen));
            const b = decoder.decode(new Uint8Array(buf, bPtr, bLen));
            return writeStringResult(state, a + b, new TextEncoder());
        },
        string_indexOf: (hayPtr: number, hayLen: number, needlePtr: number, needleLen: number): number => {
            const decoder = new TextDecoder();
            const buf = getMemoryBuffer(state);
            const haystack = decoder.decode(new Uint8Array(buf, hayPtr, hayLen));
            const needle = decoder.decode(new Uint8Array(buf, needlePtr, needleLen));
            return haystack.indexOf(needle);
        },
        toUpperCase: (ptr: number, len: number): number => {
            const str = new TextDecoder().decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            return writeStringResult(state, str.toUpperCase(), new TextEncoder());
        },
        toLowerCase: (ptr: number, len: number): number => {
            const str = new TextDecoder().decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            return writeStringResult(state, str.toLowerCase(), new TextEncoder());
        },
        string_trim: (ptr: number, len: number): number => {
            const str = new TextDecoder().decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            return writeStringResult(state, str.trim(), new TextEncoder());
        },
        string_startsWith: (strPtr: number, strLen: number, prefixPtr: number, prefixLen: number): number => {
            const decoder = new TextDecoder();
            const buf = getMemoryBuffer(state);
            const str = decoder.decode(new Uint8Array(buf, strPtr, strLen));
            const prefix = decoder.decode(new Uint8Array(buf, prefixPtr, prefixLen));
            return str.startsWith(prefix) ? 1 : 0;
        },
        string_endsWith: (strPtr: number, strLen: number, suffixPtr: number, suffixLen: number): number => {
            const decoder = new TextDecoder();
            const buf = getMemoryBuffer(state);
            const str = decoder.decode(new Uint8Array(buf, strPtr, strLen));
            const suffix = decoder.decode(new Uint8Array(buf, suffixPtr, suffixLen));
            return str.endsWith(suffix) ? 1 : 0;
        },
        string_contains: (hayPtr: number, hayLen: number, needlePtr: number, needleLen: number): number => {
            const decoder = new TextDecoder();
            const buf = getMemoryBuffer(state);
            const haystack = decoder.decode(new Uint8Array(buf, hayPtr, hayLen));
            const needle = decoder.decode(new Uint8Array(buf, needlePtr, needleLen));
            return haystack.includes(needle) ? 1 : 0;
        },
        string_repeat: (ptr: number, len: number, count: number): number => {
            const str = new TextDecoder().decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            return writeStringResult(state, str.repeat(count), new TextEncoder());
        },
    };
}

// =============================================================================
// Math builtins
// =============================================================================

function createMathImports(): Record<string, Function> {
    return {
        abs: (x: number): number => Math.abs(x),
        min: (a: number, b: number): number => Math.min(a, b),
        max: (a: number, b: number): number => Math.max(a, b),
        pow: (base: number, exp: number): number => (Math.pow(base, exp) | 0),
        sqrt: (x: number): number => Math.sqrt(x),
        floor: (x: number): number => (Math.floor(x) | 0),
        ceil: (x: number): number => (Math.ceil(x) | 0),
        round: (x: number): number => (Math.round(x) | 0),
    };
}

// =============================================================================
// Type conversion builtins
// =============================================================================

function createTypeConversionImports(state: RuntimeState): Record<string, Function> {
    return {
        intToString: (value: number): number => writeStringResult(state, String(value), new TextEncoder()),
        floatToString: (value: number): number => writeStringResult(state, String(value), new TextEncoder()),
        boolToString: (value: number): number => writeStringResult(state, value ? "true" : "false", new TextEncoder()),
        floatToInt: (value: number): number => (Math.trunc(value) | 0),
        intToFloat: (value: number): number => value,
    };
}

// =============================================================================
// Array builtins — operate on [length: i32][elem0: i32][elem1: i32]...
// =============================================================================

function createArrayImports(state: RuntimeState): Record<string, Function> {
    return {
        array_length: (arrPtr: number): number => {
            return new DataView(getMemoryBuffer(state)).getInt32(arrPtr, true);
        },
        array_get: (arrPtr: number, index: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const length = view.getInt32(arrPtr, true);
            if (index < 0 || index >= length) return 0;
            return view.getInt32(arrPtr + 4 + index * 4, true);
        },
        array_set: (arrPtr: number, index: number, value: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const length = view.getInt32(arrPtr, true);
            const elems: number[] = [];
            for (let i = 0; i < length; i++) {
                elems.push(i === index ? value : view.getInt32(arrPtr + 4 + i * 4, true));
            }
            return writeArrayResult(state, elems);
        },
        array_push: (arrPtr: number, value: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const length = view.getInt32(arrPtr, true);
            const elems: number[] = [];
            for (let i = 0; i < length; i++) {
                elems.push(view.getInt32(arrPtr + 4 + i * 4, true));
            }
            elems.push(value);
            return writeArrayResult(state, elems);
        },
        array_pop: (arrPtr: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const length = view.getInt32(arrPtr, true);
            if (length === 0) return writeArrayResult(state, []);
            const elems: number[] = [];
            for (let i = 0; i < length - 1; i++) {
                elems.push(view.getInt32(arrPtr + 4 + i * 4, true));
            }
            return writeArrayResult(state, elems);
        },
        array_concat: (aPtr: number, bPtr: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const aLen = view.getInt32(aPtr, true);
            const bLen = view.getInt32(bPtr, true);
            const elems: number[] = [];
            for (let i = 0; i < aLen; i++) {
                elems.push(view.getInt32(aPtr + 4 + i * 4, true));
            }
            for (let i = 0; i < bLen; i++) {
                elems.push(view.getInt32(bPtr + 4 + i * 4, true));
            }
            return writeArrayResult(state, elems);
        },
        array_slice: (arrPtr: number, start: number, end: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const length = view.getInt32(arrPtr, true);
            const s = Math.max(0, Math.min(start, length));
            const e = Math.max(s, Math.min(end, length));
            const elems: number[] = [];
            for (let i = s; i < e; i++) {
                elems.push(view.getInt32(arrPtr + 4 + i * 4, true));
            }
            return writeArrayResult(state, elems);
        },
        array_isEmpty: (arrPtr: number): number => {
            return new DataView(getMemoryBuffer(state)).getInt32(arrPtr, true) === 0 ? 1 : 0;
        },
        array_contains: (arrPtr: number, value: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const length = view.getInt32(arrPtr, true);
            for (let i = 0; i < length; i++) {
                if (view.getInt32(arrPtr + 4 + i * 4, true) === value) return 1;
            }
            return 0;
        },
        array_reverse: (arrPtr: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const length = view.getInt32(arrPtr, true);
            const elems: number[] = [];
            for (let i = length - 1; i >= 0; i--) {
                elems.push(view.getInt32(arrPtr + 4 + i * 4, true));
            }
            return writeArrayResult(state, elems);
        },
    };
}

// =============================================================================
// Option builtins — [tag: i32][value: i32] at 8-byte slots
// =============================================================================

function createOptionImports(state: RuntimeState): Record<string, Function> {
    return {
        isSome: (ptr: number): number => {
            return new DataView(getMemoryBuffer(state)).getInt32(ptr, true) === 1 ? 1 : 0;
        },
        isNone: (ptr: number): number => {
            return new DataView(getMemoryBuffer(state)).getInt32(ptr, true) === 0 ? 1 : 0;
        },
        unwrap: (ptr: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const tag = view.getInt32(ptr, true);
            if (tag === 1) return view.getInt32(ptr + 8, true);
            throw new Error("unwrap called on None");
        },
        unwrapOr: (ptr: number, defaultVal: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const tag = view.getInt32(ptr, true);
            if (tag === 1) return view.getInt32(ptr + 8, true);
            return defaultVal;
        },
    };
}

// =============================================================================
// Result builtins — [tag: i32][value_or_error: i32] at 8-byte slots
// Ok = tag 0, Err = tag 1
// =============================================================================

function createResultImports(state: RuntimeState): Record<string, Function> {
    return {
        isOk: (ptr: number): number => {
            return new DataView(getMemoryBuffer(state)).getInt32(ptr, true) === 0 ? 1 : 0;
        },
        isErr: (ptr: number): number => {
            return new DataView(getMemoryBuffer(state)).getInt32(ptr, true) === 1 ? 1 : 0;
        },
        unwrapOk: (ptr: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const tag = view.getInt32(ptr, true);
            if (tag === 0) return view.getInt32(ptr + 8, true);
            throw new Error("unwrapOk called on Err");
        },
        unwrapErr: (ptr: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const tag = view.getInt32(ptr, true);
            if (tag === 1) return view.getInt32(ptr + 8, true);
            throw new Error("unwrapErr called on Ok");
        },
        unwrapOkOr: (ptr: number, defaultVal: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const tag = view.getInt32(ptr, true);
            if (tag === 0) return view.getInt32(ptr + 8, true);
            return defaultVal;
        },
        unwrapErrOr: (ptr: number, defaultVal: number): number => {
            const view = new DataView(getMemoryBuffer(state));
            const tag = view.getInt32(ptr, true);
            if (tag === 1) return view.getInt32(ptr + 8, true);
            return defaultVal;
        },
    };
}

// =============================================================================
// JSON builtins — jsonParse validates JSON, jsonStringify normalizes
// =============================================================================

function createJsonImports(state: RuntimeState): Record<string, Function> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    return {
        jsonParse: (ptr: number, len: number): number => {
            const str = decoder.decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            try {
                JSON.parse(str);
                // Valid JSON — return Ok(strPtr) with original string
                const strPtr = writeStringResult(state, str, encoder);
                return writeResultValue(state, 0, strPtr); // Ok
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Invalid JSON";
                const errPtr = writeStringResult(state, msg, encoder);
                return writeResultValue(state, 1, errPtr); // Err
            }
        },
        jsonStringify: (ptr: number, len: number): number => {
            const str = decoder.decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            try {
                const parsed = JSON.parse(str);
                return writeStringResult(state, JSON.stringify(parsed), encoder);
            } catch {
                // If input is not valid JSON, return it unchanged
                return writeStringResult(state, str, encoder);
            }
        },
    };
}

// =============================================================================
// Random builtins — randomInt, randomFloat, randomUuid
// =============================================================================

function createRandomImports(state: RuntimeState): Record<string, Function> {
    const encoder = new TextEncoder();
    return {
        randomInt: (min: number, max: number): number => {
            // Inclusive range [min, max] with rejection sampling to avoid modulo bias
            const range = max - min + 1;
            const limit = 0x100000000 - (0x100000000 % range); // largest multiple of range ≤ 2^32
            const array = new Uint32Array(1);
            let val: number;
            do {
                crypto.getRandomValues(array);
                val = array[0]!;
            } while (val >= limit);
            return min + (val % range);
        },
        randomFloat: (): number => {
            const array = new Uint32Array(1);
            crypto.getRandomValues(array);
            return array[0]! / 0x100000000; // [0, 1) — divide by 2^32
        },
        randomUuid: (): number => {
            const uuid = crypto.randomUUID();
            return writeStringResult(state, uuid, encoder);
        },
    };
}

// =============================================================================
// Int64 conversion builtins — widen/narrow between Int and Int64
// =============================================================================

function createInt64Imports(state: RuntimeState): Record<string, Function> {
    const encoder = new TextEncoder();
    return {
        intToInt64: (x: number): bigint => BigInt(x),
        int64ToInt: (x: bigint): number => Number(BigInt.asIntN(32, x)),
        int64ToFloat: (x: bigint): number => Number(x),
        int64ToString: (x: bigint): number => writeStringResult(state, x.toString(), encoder),
    };
}

// =============================================================================
// Date/time builtins — now, formatDate, parseDate, diffMs
// =============================================================================

/**
 * Format a Date using strftime-style tokens.
 * Supported: %Y (year), %m (month 01-12), %d (day 01-31),
 *            %H (hour 00-23), %M (min 00-59), %S (sec 00-59), %% (literal %)
 */
function formatDateString(date: Date, fmt: string): string {
    const pad2 = (n: number): string => String(n).padStart(2, "0");
    let result = "";
    let i = 0;
    while (i < fmt.length) {
        if (fmt[i] === "%" && i + 1 < fmt.length) {
            const token = fmt[i + 1];
            switch (token) {
                case "Y": result += String(date.getUTCFullYear()); break;
                case "m": result += pad2(date.getUTCMonth() + 1); break;
                case "d": result += pad2(date.getUTCDate()); break;
                case "H": result += pad2(date.getUTCHours()); break;
                case "M": result += pad2(date.getUTCMinutes()); break;
                case "S": result += pad2(date.getUTCSeconds()); break;
                case "%": result += "%"; break;
                default: result += "%" + token; break; // unknown token → pass through
            }
            i += 2;
        } else {
            result += fmt[i];
            i++;
        }
    }
    return result;
}

function createDateTimeImports(state: RuntimeState): Record<string, Function> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    return {
        now: (): bigint => BigInt(Date.now()),
        formatDate: (timestamp: bigint, fmtPtr: number, fmtLen: number): number => {
            const fmt = decoder.decode(new Uint8Array(getMemoryBuffer(state), fmtPtr, fmtLen));
            const date = new Date(Number(timestamp));
            return writeStringResult(state, formatDateString(date, fmt), encoder);
        },
        parseDate: (strPtr: number, strLen: number, _fmtPtr: number, _fmtLen: number): bigint => {
            const str = decoder.decode(new Uint8Array(getMemoryBuffer(state), strPtr, strLen));
            const ms = Date.parse(str);
            if (isNaN(ms)) {
                throw new Error(`parseDate: invalid date string "${str}"`);
            }
            return BigInt(ms);
        },
        diffMs: (a: bigint, b: bigint): bigint => a - b,
    };
}

// =============================================================================
// Regex builtins — regexTest, regexMatch, regexReplace
// =============================================================================

function createRegexImports(state: RuntimeState): Record<string, Function> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    return {
        regexTest: (patPtr: number, patLen: number, inputPtr: number, inputLen: number): number => {
            const buf = getMemoryBuffer(state);
            const pattern = decoder.decode(new Uint8Array(buf, patPtr, patLen));
            const input = decoder.decode(new Uint8Array(buf, inputPtr, inputLen));
            try {
                return new RegExp(pattern).test(input) ? 1 : 0;
            } catch {
                return 0; // invalid regex → false
            }
        },
        regexMatch: (patPtr: number, patLen: number, inputPtr: number, inputLen: number): number => {
            const buf = getMemoryBuffer(state);
            const pattern = decoder.decode(new Uint8Array(buf, patPtr, patLen));
            const input = decoder.decode(new Uint8Array(buf, inputPtr, inputLen));
            try {
                const m = input.match(new RegExp(pattern));
                return writeStringResult(state, m ? m[0]! : "", encoder);
            } catch {
                return writeStringResult(state, "", encoder); // invalid regex → empty string
            }
        },
        regexReplace: (
            inputPtr: number, inputLen: number,
            patPtr: number, patLen: number,
            replPtr: number, replLen: number,
        ): number => {
            const buf = getMemoryBuffer(state);
            const input = decoder.decode(new Uint8Array(buf, inputPtr, inputLen));
            const pattern = decoder.decode(new Uint8Array(buf, patPtr, patLen));
            const replacement = decoder.decode(new Uint8Array(buf, replPtr, replLen));
            try {
                return writeStringResult(state, input.replace(new RegExp(pattern, "g"), replacement), encoder);
            } catch {
                return writeStringResult(state, input, encoder); // invalid regex → unchanged
            }
        },
    };
}

// =============================================================================
// Crypto hashing builtins — delegates to adapter
// =============================================================================

function createCryptoImports(state: RuntimeState, adapter: EdictHostAdapter): Record<string, Function> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    return {
        sha256: (ptr: number, len: number): number => {
            const str = decoder.decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            return writeStringResult(state, adapter.sha256(str), encoder);
        },
        md5: (ptr: number, len: number): number => {
            const str = decoder.decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
            return writeStringResult(state, adapter.md5(str), encoder);
        },
        hmac: (
            algoPtr: number, algoLen: number,
            keyPtr: number, keyLen: number,
            dataPtr: number, dataLen: number,
        ): number => {
            const buf = getMemoryBuffer(state);
            const algo = decoder.decode(new Uint8Array(buf, algoPtr, algoLen));
            const key = decoder.decode(new Uint8Array(buf, keyPtr, keyLen));
            const data = decoder.decode(new Uint8Array(buf, dataPtr, dataLen));
            return writeStringResult(state, adapter.hmac(algo, key, data), encoder);
        },
    };
}

// =============================================================================
// HTTP client builtins — delegates to adapter
// =============================================================================

function createHttpImports(state: RuntimeState, adapter: EdictHostAdapter): Record<string, Function> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    function readStr(ptr: number, len: number): string {
        return decoder.decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
    }

    function makeResult(fetchResult: { ok: boolean; data: string }): number {
        const strPtr = writeStringResult(state, fetchResult.data, encoder);
        return writeResultValue(state, fetchResult.ok ? 0 : 1, strPtr);
    }

    return {
        httpGet: (urlPtr: number, urlLen: number): number => {
            return makeResult(adapter.fetch(readStr(urlPtr, urlLen), "GET"));
        },
        httpPost: (urlPtr: number, urlLen: number, bodyPtr: number, bodyLen: number): number => {
            return makeResult(adapter.fetch(readStr(urlPtr, urlLen), "POST", readStr(bodyPtr, bodyLen)));
        },
        httpPut: (urlPtr: number, urlLen: number, bodyPtr: number, bodyLen: number): number => {
            return makeResult(adapter.fetch(readStr(urlPtr, urlLen), "PUT", readStr(bodyPtr, bodyLen)));
        },
        httpDelete: (urlPtr: number, urlLen: number): number => {
            return makeResult(adapter.fetch(readStr(urlPtr, urlLen), "DELETE"));
        },
    };
}
// =============================================================================
// IO builtins — delegates to adapter
// =============================================================================

function createIOImports(state: RuntimeState, adapter: EdictHostAdapter): Record<string, Function> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    function readStr(ptr: number, len: number): string {
        return decoder.decode(new Uint8Array(getMemoryBuffer(state), ptr, len));
    }

    return {
        readFile: (pathPtr: number, pathLen: number): number => {
            const result = adapter.readFile(readStr(pathPtr, pathLen));
            if (result.ok) {
                const strPtr = writeStringResult(state, result.data, encoder);
                return writeResultValue(state, 0, strPtr);
            } else {
                const errPtr = writeStringResult(state, result.error, encoder);
                return writeResultValue(state, 1, errPtr);
            }
        },

        writeFile: (pathPtr: number, pathLen: number, contentPtr: number, contentLen: number): number => {
            const result = adapter.writeFile(readStr(pathPtr, pathLen), readStr(contentPtr, contentLen));
            if (result.ok) {
                const okPtr = writeStringResult(state, "ok", encoder);
                return writeResultValue(state, 0, okPtr);
            } else {
                const errPtr = writeStringResult(state, result.error, encoder);
                return writeResultValue(state, 1, errPtr);
            }
        },

        env: (namePtr: number, nameLen: number): number => {
            const name = readStr(namePtr, nameLen);
            return writeStringResult(state, adapter.env(name), encoder);
        },

        args: (): number => {
            const argsJson = JSON.stringify(adapter.args());
            return writeStringResult(state, argsJson, encoder);
        },

        exit: (code: number): number => {
            adapter.exit(code);
        },
    };
}

// =============================================================================
// Factory — combines all groups into one import object
// =============================================================================

/**
 * Create the complete host import object for WASM instantiation.
 *
 * @param state — mutable runtime state shared across all host functions.
 *                `state.instance` must be set after `WebAssembly.instantiate()`
 *                but before calling any exported WASM function.
 * @param adapter — optional platform-specific adapter. Defaults to NodeHostAdapter.
 */
export function createHostImports(
    state: RuntimeState,
    adapter?: EdictHostAdapter,
): Record<string, Record<string, unknown>> {
    const hostAdapter = adapter ?? new NodeHostAdapter(state.sandboxDir);
    return {
        host: {
            ...createCoreImports(state),
            ...createStringImports(state),
            ...createMathImports(),
            ...createTypeConversionImports(state),
            ...createInt64Imports(state),
            ...createArrayImports(state),
            ...createOptionImports(state),
            ...createResultImports(state),
            ...createJsonImports(state),
            ...createRandomImports(state),
            ...createDateTimeImports(state),
            ...createRegexImports(state),
            ...createCryptoImports(state, hostAdapter),
            ...createHttpImports(state, hostAdapter),
            ...createIOImports(state, hostAdapter),
        },
    };
}
