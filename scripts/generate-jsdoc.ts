#!/usr/bin/env tsx
// =============================================================================
// generate-jsdoc.ts — Auto-generate JSDoc stubs for exported functions
// =============================================================================
// Uses TypeScript compiler API (already a dev dependency) to:
// 1. Parse source files in the public API surface
// 2. Find exported functions/classes without JSDoc
// 3. Extract param names + types + return type from the signature
// 4. Generate and insert JSDoc comments
//
// Usage:
//   npx tsx scripts/generate-jsdoc.ts          # dry-run (shows what would change)
//   npx tsx scripts/generate-jsdoc.ts --write   # write changes to files
//   npm run generate:jsdoc                      # via npm script (dry-run)
//   npm run generate:jsdoc -- --write           # via npm script (write)

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

// ─── Configuration ──────────────────────────────────────────────────────────

const PUBLIC_API_FILES = [
    "src/validator/validate.ts",
    "src/resolver/resolve.ts",
    "src/resolver/levenshtein.ts",
    "src/checker/check.ts",
    "src/checker/types-equal.ts",
    "src/effects/effect-check.ts",
    "src/effects/call-graph.ts",
    "src/contracts/verify.ts",
    "src/contracts/generate-tests.ts",
    "src/contracts/hash.ts",
    "src/contracts/z3-context.ts",
    "src/contracts/translate.ts",
    "src/codegen/codegen.ts",
    "src/codegen/runner.ts",
    "src/check.ts",
    "src/compile.ts",
    "src/lint/lint.ts",
    "src/lint/warnings.ts",
    "src/patch/apply.ts",
    "src/compose/compose.ts",
    "src/multi-module.ts",
    "src/incremental/check.ts",
    "src/incremental/dep-graph.ts",
    "src/incremental/diff.ts",
    "src/compact/expand.ts",
    "src/errors/explain.ts",
    "src/errors/error-catalog.ts",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function hasJsDoc(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    const fullText = sourceFile.getFullText();
    const start = node.getFullStart();
    const leadingTrivia = fullText.slice(start, node.getStart(sourceFile));
    return leadingTrivia.includes("/**");
}

function getIndent(node: ts.Node, sourceFile: ts.SourceFile): string {
    const lineStart = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const lineText = sourceFile.getFullText().split("\n")[lineStart.line] ?? "";
    const match = lineText.match(/^(\s*)/);
    return match?.[1] ?? "";
}

function formatType(
    type: ts.TypeNode | undefined,
    checker: ts.TypeChecker,
    node: ts.Node,
): string {
    if (type) {
        return type.getText();
    }
    // Fall back to inferred type from checker
    const symbol = (node as any).symbol;
    if (symbol) {
        const t = checker.getTypeOfSymbolAtLocation(symbol, node);
        return checker.typeToString(t);
    }
    return "unknown";
}

function formatReturnType(
    fn: ts.FunctionDeclaration,
    checker: ts.TypeChecker,
): string {
    if (fn.type) {
        return fn.type.getText();
    }
    const signature = checker.getSignatureFromDeclaration(fn);
    if (signature) {
        const returnType = checker.getReturnTypeOfSignature(signature);
        return checker.typeToString(returnType);
    }
    return "void";
}

function generateJsDoc(
    fn: ts.FunctionDeclaration,
    checker: ts.TypeChecker,
    indent: string,
): string {
    const name = fn.name?.getText() ?? "anonymous";
    const lines: string[] = [];

    lines.push(`${indent}/**`);
    lines.push(`${indent} * TODO: Document \`${name}\`.`);

    // Add @param tags
    const params = fn.parameters;
    if (params.length > 0) {
        lines.push(`${indent} *`);
        for (const param of params) {
            const paramName = param.name.getText();
            const paramType = formatType(param.type, checker, param);
            lines.push(`${indent} * @param ${paramName} - {${paramType}}`);
        }
    }

    // Add @returns tag
    const returnType = formatReturnType(fn, checker);
    if (returnType !== "void") {
        lines.push(`${indent} * @returns {${returnType}}`);
    }

    lines.push(`${indent} */`);
    return lines.join("\n");
}

function generateClassJsDoc(
    cls: ts.ClassDeclaration,
    indent: string,
): string {
    const name = cls.name?.getText() ?? "anonymous";
    const lines: string[] = [];
    lines.push(`${indent}/**`);
    lines.push(`${indent} * TODO: Document \`${name}\`.`);
    lines.push(`${indent} */`);
    return lines.join("\n");
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

interface MissingJsDoc {
    filePath: string;
    functionName: string;
    line: number;
    jsDoc: string;
    insertPos: number; // character position in file to insert before
}

function findMissing(rootDir: string): MissingJsDoc[] {
    const absolutePaths = PUBLIC_API_FILES.map((f) => path.resolve(rootDir, f)).filter(
        (f) => fs.existsSync(f),
    );

    const program = ts.createProgram(absolutePaths, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        skipLibCheck: true,
    });

    const checker = program.getTypeChecker();
    const results: MissingJsDoc[] = [];

    for (const filePath of absolutePaths) {
        const sourceFile = program.getSourceFile(filePath);
        if (!sourceFile) continue;

        ts.forEachChild(sourceFile, (node) => {
            // Only check exported function declarations and class declarations
            const isExported = !!(
                ts.getCombinedModifierFlags(node as ts.Declaration) &
                ts.ModifierFlags.Export
            );
            if (!isExported) return;

            if (ts.isFunctionDeclaration(node) && node.name) {
                if (!hasJsDoc(node, sourceFile)) {
                    const indent = getIndent(node, sourceFile);
                    const jsDoc = generateJsDoc(node, checker, indent);
                    const lineNum =
                        sourceFile.getLineAndCharacterOfPosition(
                            node.getStart(sourceFile),
                        ).line + 1;

                    results.push({
                        filePath: path.relative(rootDir, filePath),
                        functionName: node.name.getText(),
                        line: lineNum,
                        jsDoc,
                        insertPos: node.getStart(sourceFile),
                    });
                }
            } else if (ts.isClassDeclaration(node) && node.name) {
                if (!hasJsDoc(node, sourceFile)) {
                    const indent = getIndent(node, sourceFile);
                    const jsDoc = generateClassJsDoc(node, indent);
                    const lineNum =
                        sourceFile.getLineAndCharacterOfPosition(
                            node.getStart(sourceFile),
                        ).line + 1;

                    results.push({
                        filePath: path.relative(rootDir, filePath),
                        functionName: node.name.getText(),
                        line: lineNum,
                        jsDoc,
                        insertPos: node.getStart(sourceFile),
                    });
                }
            }
        });
    }

    return results;
}

function applyFixes(rootDir: string, items: MissingJsDoc[]): void {
    // Group by file for batch edits
    const byFile = new Map<string, MissingJsDoc[]>();
    for (const item of items) {
        const absolute = path.resolve(rootDir, item.filePath);
        if (!byFile.has(absolute)) byFile.set(absolute, []);
        byFile.get(absolute)!.push(item);
    }

    for (const [filePath, fixes] of byFile) {
        let content = fs.readFileSync(filePath, "utf-8");

        // Sort by position descending so insertions don't shift earlier positions
        fixes.sort((a, b) => b.insertPos - a.insertPos);

        for (const fix of fixes) {
            // Insert JSDoc right before the export keyword line
            const before = content.slice(0, fix.insertPos);
            const lastNewline = before.lastIndexOf("\n");
            const insertAt = lastNewline === -1 ? 0 : lastNewline + 1;

            const prefix = content.slice(0, insertAt);
            const suffix = content.slice(insertAt);

            content = prefix + fix.jsDoc + "\n" + suffix;
        }

        fs.writeFileSync(filePath, content, "utf-8");
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const rootDir = path.resolve(import.meta.dirname, "..");
const writeMode = process.argv.includes("--write");

const missing = findMissing(rootDir);

if (missing.length === 0) {
    console.log("✅ All exported functions in public API files have JSDoc.");
    process.exit(0);
}

console.log(`Found ${missing.length} exported function(s) without JSDoc:\n`);

for (const item of missing) {
    console.log(`  ${item.filePath}:${item.line}  ${item.functionName}`);
    if (!writeMode) {
        console.log("  Would insert:");
        console.log(
            item.jsDoc
                .split("\n")
                .map((l) => "    " + l)
                .join("\n"),
        );
        console.log();
    }
}

if (writeMode) {
    applyFixes(rootDir, missing);
    console.log(`\n✅ Inserted ${missing.length} JSDoc stub(s). Review with \`git diff\`.`);
} else {
    console.log(
        `\nRun with --write to insert stubs: npx tsx scripts/generate-jsdoc.ts --write`,
    );
    process.exit(1);
}
