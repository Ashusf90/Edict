/**
 * Sync server.json version fields from package.json.
 *
 * Ensures the MCP registry metadata never goes stale.
 * Run as part of the build pipeline.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const serverJsonPath = resolve(root, "server.json");
const server = JSON.parse(readFileSync(serverJsonPath, "utf8"));

let changed = false;

if (server.version !== pkg.version) {
    server.version = pkg.version;
    changed = true;
}

for (const p of server.packages ?? []) {
    if (p.identifier === pkg.name && p.version !== pkg.version) {
        p.version = pkg.version;
        changed = true;
    }
}

if (changed) {
    writeFileSync(serverJsonPath, JSON.stringify(server, null, 2) + "\n");
    console.log(`✅ server.json synced to version ${pkg.version}`);
} else {
    console.log(`✅ server.json already at version ${pkg.version}`);
}
