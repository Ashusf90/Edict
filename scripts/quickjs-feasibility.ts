// =============================================================================
// QuickJS Feasibility Study — Harness Script
// =============================================================================
// Loads the Edict compiler IIFE bundle inside a QuickJS WASM interpreter,
// runs checkBrowser() on a sample program, and benchmarks against native Node.js.
//
// This addresses GitHub issue #134: self-hosting feasibility study.
//
// Prerequisites:
//   1. npm run build                          (produce dist/)
//   2. tsx scripts/build-quickjs-bundle.ts    (produce IIFE bundles)
//   3. tsx scripts/quickjs-feasibility.ts     (this script)

import { getQuickJS } from "quickjs-emscripten";
import { readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

// We import checkBrowser from the compiled dist to avoid tsx resolution issues
import { checkBrowser } from "../dist/browser.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CHECK_BUNDLE = resolve("dist/edict-quickjs-check.js");
const FULL_BUNDLE = resolve("dist/edict-quickjs-full.js");
const SAMPLE_PROGRAM = resolve("examples/fibonacci.edict.json");
const RUNS = 5; // Number of check runs for stable timing

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]!
        : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function formatBytes(bytes: number): string {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatMs(ms: number): string {
    return ms.toFixed(1);
}

// ---------------------------------------------------------------------------
// Results structure
// ---------------------------------------------------------------------------

interface FeasibilityResults {
    timestamp: string;
    nodeVersion: string;
    platform: string;
    bundles: {
        check: { path: string; sizeBytes: number; sizeFormatted: string };
        full: { path: string; available: boolean; error?: string };
    };
    quickjsCheck: {
        bundleLoadMs: number;
        checkMs: number;
        runs: number;
        ok: boolean;
        resultSnapshot?: unknown;
        error?: string;
    };
    nativeCheck: {
        checkMs: number;
        runs: number;
    };
    comparison: {
        slowdownRatio: number;
        checkTimeQuickJs: number;
        checkTimeNative: number;
    };
    quickjsCompile: {
        attempted: boolean;
        ok: boolean;
        error?: string;
    };
    memory: {
        description: string;
        raw?: string;
    };
    blockers: string[];
    recommendations: string[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║        Edict QuickJS Feasibility Study                     ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
    console.log(`Node ${process.version} | ${process.platform}-${process.arch}\n`);

    const blockers: string[] = [];
    const recommendations: string[] = [];

    // -----------------------------------------------------------------------
    // Step 1: Check bundle availability
    // -----------------------------------------------------------------------
    console.log("── Step 1: Bundle Availability ──────────────────────────────\n");

    if (!existsSync(CHECK_BUNDLE)) {
        console.error(`✗ Check bundle not found: ${CHECK_BUNDLE}`);
        console.error("  Run: tsx scripts/build-quickjs-bundle.ts");
        process.exit(1);
    }
    const checkBundleSize = statSync(CHECK_BUNDLE).size;
    console.log(`✓ Check bundle:  ${formatBytes(checkBundleSize)} (${CHECK_BUNDLE})`);

    const fullBundleAvailable = existsSync(FULL_BUNDLE);
    let fullBundleError: string | undefined;
    if (fullBundleAvailable) {
        const fullBundleSize = statSync(FULL_BUNDLE).size;
        console.log(`✓ Full bundle:   ${formatBytes(fullBundleSize)} (${FULL_BUNDLE})`);
    } else {
        fullBundleError = "binaryen uses top-level await — incompatible with IIFE format for QuickJS";
        console.log(`✗ Full bundle:   NOT AVAILABLE — ${fullBundleError}`);
        blockers.push(`Full pipeline bundle: ${fullBundleError}`);
    }

    // -----------------------------------------------------------------------
    // Step 2: Load sample program
    // -----------------------------------------------------------------------
    console.log("\n── Step 2: Sample Program ───────────────────────────────────\n");

    if (!existsSync(SAMPLE_PROGRAM)) {
        console.error(`✗ Sample program not found: ${SAMPLE_PROGRAM}`);
        process.exit(1);
    }
    const sampleAst = JSON.parse(readFileSync(SAMPLE_PROGRAM, "utf-8"));
    console.log(`✓ Loaded: ${SAMPLE_PROGRAM}`);

    // -----------------------------------------------------------------------
    // Step 3: Native Node.js baseline
    // -----------------------------------------------------------------------
    console.log("\n── Step 3: Native Node.js Baseline ─────────────────────────\n");

    const nativeTimes: number[] = [];
    for (let i = 0; i < RUNS; i++) {
        const start = performance.now();
        const result = checkBrowser(sampleAst);
        const elapsed = performance.now() - start;
        nativeTimes.push(elapsed);
        if (i === 0 && !result.ok) {
            console.error("✗ Native checkBrowser failed:", JSON.stringify(result.errors[0]));
            process.exit(1);
        }
    }
    const nativeMedian = median(nativeTimes);
    console.log(`✓ Native checkBrowser: ${formatMs(nativeMedian)}ms (median of ${RUNS} runs)`);
    console.log(`  Individual: ${nativeTimes.map(t => formatMs(t) + "ms").join(", ")}`);

    // -----------------------------------------------------------------------
    // Step 4: QuickJS — load and run
    // -----------------------------------------------------------------------
    console.log("\n── Step 4: QuickJS Runtime ──────────────────────────────────\n");

    const qjsInitStart = performance.now();
    const QuickJS = await getQuickJS();
    const qjsInitMs = performance.now() - qjsInitStart;
    console.log(`✓ QuickJS WASM initialized: ${formatMs(qjsInitMs)}ms`);

    const rt = QuickJS.newRuntime();
    // Set generous memory limit (256 MB)
    rt.setMemoryLimit(256 * 1024 * 1024);
    // Set generous stack size (1 MB)
    rt.setMaxStackSize(1024 * 1024);

    const vm = rt.newContext();

    // QuickJS doesn't have Web APIs — inject minimal polyfills
    const polyfills = `
// Minimal TextEncoder/TextDecoder polyfill for QuickJS
globalThis.TextEncoder = class TextEncoder {
    encode(str) {
        const arr = [];
        for (let i = 0; i < str.length; i++) {
            let c = str.charCodeAt(i);
            if (c < 0x80) {
                arr.push(c);
            } else if (c < 0x800) {
                arr.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
            } else {
                arr.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
            }
        }
        return new Uint8Array(arr);
    }
};
globalThis.TextDecoder = class TextDecoder {
    decode(buf) {
        const bytes = new Uint8Array(buf);
        let str = "";
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            if (b < 0x80) {
                str += String.fromCharCode(b);
            } else if (b < 0xe0) {
                str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
            } else {
                str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
            }
        }
        return str;
    }
};
`;
    const polyfillResult = vm.evalCode(polyfills, "polyfills.js");
    if (polyfillResult.error) {
        const errorStr = vm.dump(polyfillResult.error);
        polyfillResult.error.dispose();
        console.error(`✗ Polyfill injection failed: ${JSON.stringify(errorStr)}`);
        vm.dispose();
        rt.dispose();
        process.exit(1);
    }
    polyfillResult.value.dispose();
    console.log("  Polyfills injected (TextEncoder, TextDecoder)");

    // Load the bundle
    const bundleSource = readFileSync(CHECK_BUNDLE, "utf-8");
    console.log(`  Bundle source: ${formatBytes(bundleSource.length)} (text)`);

    const bundleLoadStart = performance.now();
    const loadResult = vm.evalCode(bundleSource, "edict-bundle.js");
    const bundleLoadMs = performance.now() - bundleLoadStart;

    if (loadResult.error) {
        const errorStr = vm.dump(loadResult.error);
        loadResult.error.dispose();
        console.error(`✗ Bundle load FAILED: ${JSON.stringify(errorStr)}`);
        blockers.push(`Bundle load failure: ${JSON.stringify(errorStr)}`);
        vm.dispose();
        rt.dispose();
        process.exit(1);
    }
    loadResult.value.dispose();
    console.log(`✓ Bundle loaded in QuickJS: ${formatMs(bundleLoadMs)}ms`);

    // -----------------------------------------------------------------------
    // Step 5: Run checkBrowser inside QuickJS
    // -----------------------------------------------------------------------
    console.log("\n── Step 5: QuickJS checkBrowser ─────────────────────────────\n");

    const astJson = JSON.stringify(sampleAst);
    const checkCode = `JSON.stringify(Edict.checkBrowser(${astJson}))`;

    let quickjsCheckOk = false;
    let quickjsResultSnapshot: unknown;
    let quickjsCheckError: string | undefined;
    const quickjsTimes: number[] = [];

    for (let i = 0; i < RUNS; i++) {
        const checkStart = performance.now();
        const checkResult = vm.evalCode(checkCode, "check-run.js");
        const checkElapsed = performance.now() - checkStart;

        if (checkResult.error) {
            const errorStr = vm.dump(checkResult.error);
            checkResult.error.dispose();
            quickjsCheckError = JSON.stringify(errorStr);
            console.error(`✗ QuickJS checkBrowser FAILED (run ${i + 1}): ${quickjsCheckError}`);
            blockers.push(`checkBrowser inside QuickJS: ${quickjsCheckError}`);
            break;
        }

        const resultJson = vm.getString(checkResult.value);
        checkResult.value.dispose();
        quickjsTimes.push(checkElapsed);

        if (i === 0) {
            quickjsResultSnapshot = JSON.parse(resultJson);
            const parsed = quickjsResultSnapshot as { ok: boolean };
            quickjsCheckOk = parsed.ok;
            if (!quickjsCheckOk) {
                console.error(`✗ QuickJS checkBrowser returned ok=false`);
                console.error(`  Result: ${resultJson.substring(0, 200)}`);
            }
        }
    }

    if (quickjsTimes.length > 0) {
        const quickjsMedian = median(quickjsTimes);
        const ratio = quickjsMedian / nativeMedian;
        console.log(`✓ QuickJS checkBrowser: ${formatMs(quickjsMedian)}ms (median of ${quickjsTimes.length} runs)`);
        console.log(`  Individual: ${quickjsTimes.map(t => formatMs(t) + "ms").join(", ")}`);
        console.log(`  Slowdown: ${ratio.toFixed(1)}x vs native Node.js`);
        console.log(`  Result ok: ${quickjsCheckOk}`);

        // -----------------------------------------------------------------------
        // Step 6: Memory usage
        // -----------------------------------------------------------------------
        console.log("\n── Step 6: Memory Usage ─────────────────────────────────────\n");

        const memUsage = rt.dumpMemoryUsage();
        console.log(`  QuickJS memory usage:\n${memUsage}`);

        // -----------------------------------------------------------------------
        // Step 7: Attempt compile (if full bundle exists)
        // -----------------------------------------------------------------------
        console.log("\n── Step 7: Compile Attempt ──────────────────────────────────\n");

        let compileAttempted = false;
        let compileOk = false;
        let compileError: string | undefined;

        if (!fullBundleAvailable) {
            console.log("  ⊘ Full bundle not available — skipping compile test");
            blockers.push("WASM codegen unavailable: binaryen cannot be bundled in IIFE format (top-level await)");
            blockers.push("Even if bundled, QuickJS lacks the WebAssembly API needed by binaryen at runtime");
        } else {
            compileAttempted = true;
            console.log("  Full bundle exists — attempting compileBrowser inside QuickJS...");

            // Load the full bundle in a fresh context
            const vmFull = rt.newContext();
            const pfRes = vmFull.evalCode(polyfills, "polyfills.js");
            if (pfRes.error) { pfRes.error.dispose(); } else { pfRes.value.dispose(); }

            const fullBundleSource = readFileSync(FULL_BUNDLE, "utf-8");
            const fullLoadRes = vmFull.evalCode(fullBundleSource, "edict-full-bundle.js");

            if (fullLoadRes.error) {
                const err = vmFull.dump(fullLoadRes.error);
                fullLoadRes.error.dispose();
                compileError = typeof err === "object" && err !== null && "message" in err
                    ? (err as { message: string }).message
                    : JSON.stringify(err);
                console.log(`  ✗ Full bundle load failed: ${compileError}`);
                blockers.push(`Full pipeline inside QuickJS: ${compileError}`);
            } else {
                fullLoadRes.value.dispose();
                // Try compileBrowser
                const compileCode = `JSON.stringify(Edict.compileBrowser(${astJson}))`;
                const compileRes = vmFull.evalCode(compileCode, "compile-run.js");
                if (compileRes.error) {
                    const err = vmFull.dump(compileRes.error);
                    compileRes.error.dispose();
                    compileError = typeof err === "object" && err !== null && "message" in err
                        ? (err as { message: string }).message
                        : JSON.stringify(err);
                    console.log(`  ✗ compileBrowser failed: ${compileError}`);
                    blockers.push(`compileBrowser inside QuickJS: ${compileError}`);
                } else {
                    const compileResultJson = vmFull.getString(compileRes.value);
                    compileRes.value.dispose();
                    const parsed = JSON.parse(compileResultJson) as { ok: boolean };
                    compileOk = parsed.ok;
                    if (compileOk) {
                        console.log(`  ✓ compileBrowser succeeded inside QuickJS!`);
                    } else {
                        compileError = "compileBrowser returned ok=false (binaryen shimmed — expected)";
                        console.log(`  ✗ ${compileError}`);
                        blockers.push(compileError);
                    }
                }
            }
            vmFull.dispose();
        }

        // -----------------------------------------------------------------------
        // Build recommendations
        // -----------------------------------------------------------------------
        if (quickjsCheckOk) {
            recommendations.push("Phases 1-3 (validate, resolve, typeCheck, effectCheck) work inside QuickJS — suitable for schema validation and type checking in sandboxed environments");
        }
        recommendations.push("WASM codegen requires binaryen, which needs WebAssembly API — consider interpreter-based codegen (bytecode) as alternative");
        recommendations.push("Consider pre-compiling binaryen to a QuickJS-native module via FFI, or using a JS-only WASM encoder");
        if (ratio > 50) {
            recommendations.push(`Performance: ${ratio.toFixed(0)}x slowdown may be acceptable for offline/batch compilation but not for interactive use`);
        } else if (ratio > 10) {
            recommendations.push(`Performance: ${ratio.toFixed(0)}x slowdown is moderate — acceptable for most agent workflows`);
        } else {
            recommendations.push(`Performance: ${ratio.toFixed(0)}x slowdown is excellent — viable for real-time agent use`);
        }

        // -----------------------------------------------------------------------
        // Build results
        // -----------------------------------------------------------------------
        const results: FeasibilityResults = {
            timestamp: new Date().toISOString(),
            nodeVersion: process.version,
            platform: `${process.platform}-${process.arch}`,
            bundles: {
                check: { path: CHECK_BUNDLE, sizeBytes: checkBundleSize, sizeFormatted: formatBytes(checkBundleSize) },
                full: { path: FULL_BUNDLE, available: fullBundleAvailable, error: fullBundleError },
            },
            quickjsCheck: {
                bundleLoadMs,
                checkMs: quickjsMedian,
                runs: quickjsTimes.length,
                ok: quickjsCheckOk,
                resultSnapshot: quickjsResultSnapshot,
                error: quickjsCheckError,
            },
            nativeCheck: {
                checkMs: nativeMedian,
                runs: RUNS,
            },
            comparison: {
                slowdownRatio: ratio,
                checkTimeQuickJs: quickjsMedian,
                checkTimeNative: nativeMedian,
            },
            quickjsCompile: {
                attempted: compileAttempted,
                ok: compileOk,
                error: compileError,
            },
            memory: {
                description: "QuickJS runtime memory after loading bundle + running checks",
                raw: memUsage,
            },
            blockers,
            recommendations,
        };

        // Write JSON results
        const jsonPath = "quickjs-feasibility-results.json";
        writeFileSync(jsonPath, JSON.stringify(results, null, 2) + "\n");
        console.log(`\n✓ Results written to ${jsonPath}`);

        // -----------------------------------------------------------------------
        // Summary
        // -----------------------------------------------------------------------
        console.log("\n══════════════════════════════════════════════════════════════");
        console.log("  SUMMARY");
        console.log("══════════════════════════════════════════════════════════════\n");
        console.log(`  Check bundle size:     ${formatBytes(checkBundleSize)}`);
        console.log(`  Bundle load time:      ${formatMs(bundleLoadMs)}ms`);
        console.log(`  checkBrowser (QuickJS): ${formatMs(quickjsMedian)}ms`);
        console.log(`  checkBrowser (Native):  ${formatMs(nativeMedian)}ms`);
        console.log(`  Slowdown ratio:        ${ratio.toFixed(1)}x`);
        console.log(`  checkBrowser result:   ${quickjsCheckOk ? "✓ OK" : "✗ FAILED"}`);
        console.log(`  Compile available:     ${fullBundleAvailable ? "yes" : "NO (binaryen blocker)"}`);
        console.log();
        console.log("  Blockers:");
        for (const b of blockers) console.log(`    • ${b}`);
        console.log();
        console.log("  Recommendations:");
        for (const r of recommendations) console.log(`    → ${r}`);
        console.log();
    }

    // Cleanup
    vm.dispose();
    rt.dispose();
}

main().catch((err) => {
    console.error("\nFeasibility study failed:", err);
    process.exit(1);
});
