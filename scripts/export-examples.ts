import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleExport } from "../src/mcp/handlers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, "..", "examples");
const outDir = resolve(examplesDir, "skills");

async function main() {
    console.log(`Exporting examples from ${examplesDir} into UASF format...`);
    mkdirSync(outDir, { recursive: true });
    const files = readdirSync(examplesDir).filter((f) => f.endsWith(".edict.json"));

    let exported = 0;
    
    for (const file of files) {
        const fullPath = resolve(examplesDir, file);
        const name = file.replace(".edict.json", "");
        
        console.log(`[ ] ${name}`);
        try {
            const content = readFileSync(fullPath, "utf-8");
            const ast = JSON.parse(content);
            
            const result = await handleExport(ast, {
                name: name,
                version: "1.0.0",
                description: `Exported Edict example: ${name}`,
                author: "Edict Compiler",
            });
            
            if (result.ok && result.skill) {
                const outPath = resolve(outDir, `${name}.uasf.json`);
                writeFileSync(outPath, JSON.stringify(result.skill, null, 2));
                exported++;
                console.log(`[✔] Saved to skills/${name}.uasf.json`);
            } else {
                console.warn(`[✖] Export failed for ${name}:`, JSON.stringify(result.errors));
            }
        } catch (e: any) {
            console.error(`[✖] Error processing ${name}: ${e.message}`);
        }
    }
    console.log(`\nDone. Successfully exported ${exported}/${files.length} examples to UASF.`);
}

main().catch(console.error);
