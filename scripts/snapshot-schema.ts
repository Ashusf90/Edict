// =============================================================================
// Snapshot Schema — Capture current schema as a versioned snapshot
// =============================================================================
// Usage: tsx scripts/snapshot-schema.ts [version]
// Copies schema/edict.schema.json → schema/snapshots/v{version}.json
// Run this once per schema version bump.

import { resolve, dirname } from "node:path";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CURRENT_SCHEMA_VERSION } from "../src/migration/migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const version = process.argv[2] || CURRENT_SCHEMA_VERSION;
const srcPath = resolve(projectRoot, "schema/edict.schema.json");
const destDir = resolve(projectRoot, "schema/snapshots");
const destPath = resolve(destDir, `v${version}.json`);

if (!existsSync(srcPath)) {
    console.error(`❌ Schema not found at ${srcPath}. Run 'npm run generate-schema' first.`);
    process.exit(1);
}

if (existsSync(destPath)) {
    console.log(`⚠️  Snapshot v${version} already exists at ${destPath}. Skipping.`);
    process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(srcPath, destPath);
console.log(`✅ Schema snapshot v${version} saved to ${destPath}`);
