// =============================================================================
// JSON Schema Generator for Edict AST
// =============================================================================
// Generates a JSON Schema from the TypeScript AST interfaces.
// Usage: npm run generate-schema

import { resolve, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as TJS from "typescript-json-schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Point to the tsconfig
const tsconfig = resolve(projectRoot, "tsconfig.json");

// Build the schema generator
const program = TJS.getProgramFromFiles(
    [resolve(projectRoot, "src/ast/nodes.ts")],
    {
        strict: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        moduleResolution: /* bundler isn't supported by TJS, use node */ undefined,
    },
    projectRoot,
);

const settings: TJS.PartialArgs = {
    required: true,
    noExtraProps: false,
    strictNullChecks: true,
    ref: true,
};

// Generate from EdictModule — the root AST type
const schema = TJS.generateSchema(program, "EdictModule", settings);

if (!schema) {
    console.error("❌ Failed to generate schema for EdictModule");
    process.exit(1);
}

// Generate EdictFragment schema
const fragmentSchema = TJS.generateSchema(program, "EdictFragment", settings);

if (!fragmentSchema) {
    console.error("❌ Failed to generate schema for EdictFragment");
    process.exit(1);
}

// =============================================================================
// Post-processing: inject kind enum constraints on discriminated unions
// =============================================================================
// For anyOf union definitions (Definition, Expression, TypeExpr, Pattern, etc.),
// add a top-level properties.kind.enum listing all valid kind values.
// This lets LLMs with structured output mode reject invalid kinds at schema level.
// Enum values are derived from the schema's own const/enum values — no hand-written lists.

type SchemaObj = Record<string, unknown>;

function injectKindEnums(schemaRoot: SchemaObj): void {
    const defs = schemaRoot["definitions"] as Record<string, SchemaObj> | undefined;
    if (!defs) return;

    for (const [, defSchema] of Object.entries(defs)) {
        const anyOf = defSchema["anyOf"] as SchemaObj[] | undefined;
        if (!anyOf || !Array.isArray(anyOf)) continue;

        // Already has properties.kind — skip
        const existingProps = defSchema["properties"] as Record<string, SchemaObj> | undefined;
        if (existingProps?.["kind"]) continue;

        // Collect kind values from all branches
        const kindValues: string[] = [];
        let allBranchesHaveKind = true;

        for (const branch of anyOf) {
            // Resolve $ref
            let resolved: SchemaObj = branch;
            if (branch["$ref"]) {
                const ref = branch["$ref"] as string;
                const prefix = "#/definitions/";
                if (ref.startsWith(prefix)) {
                    const name = decodeURIComponent(ref.slice(prefix.length));
                    resolved = defs[name] as SchemaObj;
                    if (!resolved) { allBranchesHaveKind = false; break; }
                } else {
                    allBranchesHaveKind = false; break;
                }
            }

            // Branch must be an object type with properties.kind
            const props = resolved["properties"] as Record<string, SchemaObj> | undefined;
            if (!props?.["kind"]) {
                // Non-object branch (e.g., string enum in Effect union) — skip this definition
                allBranchesHaveKind = false;
                break;
            }

            const kindProp = props["kind"];
            if (kindProp["const"]) {
                kindValues.push(kindProp["const"] as string);
            } else if (kindProp["enum"]) {
                kindValues.push(...(kindProp["enum"] as string[]));
            } else {
                allBranchesHaveKind = false;
                break;
            }
        }

        if (allBranchesHaveKind && kindValues.length > 0) {
            defSchema["properties"] = {
                "kind": { "type": "string", "enum": kindValues },
            };
        }
    }
}

injectKindEnums(schema as SchemaObj);
injectKindEnums(fragmentSchema as SchemaObj);

// Write output
const outputDir = resolve(projectRoot, "schema");
mkdirSync(outputDir, { recursive: true });

const outputPath = resolve(outputDir, "edict.schema.json");
writeFileSync(outputPath, JSON.stringify(schema, null, 2) + "\n");
console.log(`✅ Schema written to ${outputPath}`);

const fragmentOutputPath = resolve(outputDir, "edict-fragment.schema.json");
writeFileSync(fragmentOutputPath, JSON.stringify(fragmentSchema, null, 2) + "\n");
console.log(`✅ Fragment schema written to ${fragmentOutputPath}`);
