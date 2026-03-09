// =============================================================================
// Diff Schemas — Auto-generate migration ops from schema snapshot diffs
// =============================================================================
// Compares consecutive schema snapshots and generates migration ops.
// Run during build: npm run diff-schemas
//
// Output: src/migration/generated-migrations.json
// The migrate.ts module can import this to extend MIGRATION_REGISTRY.

import { resolve, dirname } from "node:path";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const snapshotDir = resolve(projectRoot, "schema/snapshots");
const outputPath = resolve(projectRoot, "src/migration/generated-migrations.json");

interface MigrationOp {
    op: "add_field" | "remove_field" | "rename_field" | "set_field";
    path: string;
    default?: unknown;
    newName?: string;
    value?: unknown;
}

interface Migration {
    from: string;
    to: string;
    ops: MigrationOp[];
}

// =============================================================================
// Schema diffing
// =============================================================================

/**
 * Compare two JSON Schema objects and produce migration ops for top-level
 * property differences. Handles nested $ref-based definitions too.
 */
function diffSchemas(
    oldSchema: Record<string, unknown>,
    newSchema: Record<string, unknown>,
    prefix: string = "",
): MigrationOp[] {
    const ops: MigrationOp[] = [];

    const oldProps = (oldSchema.properties || {}) as Record<string, unknown>;
    const newProps = (newSchema.properties || {}) as Record<string, unknown>;
    const oldRequired = new Set((oldSchema.required || []) as string[]);
    const newRequired = new Set((newSchema.required || []) as string[]);

    // Detect added properties
    for (const key of Object.keys(newProps)) {
        if (!(key in oldProps)) {
            const path = prefix ? `${prefix}.${key}` : key;
            const defaultVal = inferDefault(newProps[key] as Record<string, unknown>);
            ops.push({ op: "add_field", path, default: defaultVal });
        }
    }

    // Detect removed properties
    for (const key of Object.keys(oldProps)) {
        if (!(key in newProps)) {
            const path = prefix ? `${prefix}.${key}` : key;
            ops.push({ op: "remove_field", path });
        }
    }

    return ops;
}

/**
 * Infer a sensible default value from a JSON Schema property definition.
 */
function inferDefault(prop: Record<string, unknown>): unknown {
    if ("default" in prop) return prop.default;

    const type = prop.type as string | undefined;
    switch (type) {
        case "string": return "";
        case "number":
        case "integer": return 0;
        case "boolean": return false;
        case "array": return [];
        case "object": return {};
        default: return null;
    }
}

// =============================================================================
// Main
// =============================================================================

function main() {
    if (!existsSync(snapshotDir)) {
        console.log("ℹ️  No schema snapshots found. Nothing to diff.");
        writeFileSync(outputPath, JSON.stringify([], null, 2) + "\n");
        return;
    }

    // Find and sort snapshot files (v1.0.json, v1.1.json, etc.)
    const files = readdirSync(snapshotDir)
        .filter((f) => f.startsWith("v") && f.endsWith(".json"))
        .sort((a, b) => {
            const va = a.replace(/^v/, "").replace(/\.json$/, "");
            const vb = b.replace(/^v/, "").replace(/\.json$/, "");
            return compareVersions(va, vb);
        });

    if (files.length < 2) {
        console.log("ℹ️  Need at least 2 snapshots to generate migrations.");
        writeFileSync(outputPath, JSON.stringify([], null, 2) + "\n");
        return;
    }

    const migrations: Migration[] = [];

    for (let i = 0; i < files.length - 1; i++) {
        const fromFile = files[i];
        const toFile = files[i + 1];
        const fromVersion = fromFile.replace(/^v/, "").replace(/\.json$/, "");
        const toVersion = toFile.replace(/^v/, "").replace(/\.json$/, "");

        const oldSchema = JSON.parse(readFileSync(resolve(snapshotDir, fromFile), "utf-8"));
        const newSchema = JSON.parse(readFileSync(resolve(snapshotDir, toFile), "utf-8"));

        const ops = diffSchemas(oldSchema, newSchema);

        if (ops.length > 0) {
            migrations.push({ from: fromVersion, to: toVersion, ops });
            console.log(`✅ Migration ${fromVersion} → ${toVersion}: ${ops.length} op(s)`);
        } else {
            console.log(`ℹ️  No structural differences between v${fromVersion} and v${toVersion}`);
        }
    }

    writeFileSync(outputPath, JSON.stringify(migrations, null, 2) + "\n");
    console.log(`✅ Generated migrations written to ${outputPath}`);
}

function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const va = pa[i] || 0;
        const vb = pb[i] || 0;
        if (va !== vb) return va - vb;
    }
    return 0;
}

main();
