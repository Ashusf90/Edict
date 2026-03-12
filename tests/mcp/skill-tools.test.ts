import { describe, it, expect } from "vitest";
import { handleCompile, handlePackageSkill, handleImportSkill, handleVersion } from "../../src/mcp/handlers.js";

// A simple program: main() returns 3 + 4 = 7
const addAst = {
    kind: "module",
    id: "mod1",
    name: "AddSkill",
    imports: [],
    definitions: [
        {
            kind: "fn",
            id: "fn_main",
            name: "main",
            params: [],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [
                {
                    kind: "binop",
                    id: "add1",
                    op: "+",
                    left: { kind: "literal", id: "lit3", value: 3 },
                    right: { kind: "literal", id: "lit4", value: 4 },
                },
            ],
        },
    ],
};

// Module without a main function
const noMainAst = {
    kind: "module",
    id: "mod2",
    name: "NoMain",
    imports: [],
    definitions: [
        {
            kind: "fn",
            id: "fn_helper",
            name: "helper",
            params: [],
            effects: ["pure"],
            returnType: { kind: "basic", name: "Int" },
            contracts: [],
            body: [{ kind: "literal", id: "lit1", value: 42 }],
        },
    ],
};

describe("MCP Skill Tools — edict_package + edict_invoke_skill", () => {
    it("edict_package produces a valid SkillPackage from compile output", async () => {
        // Step 1: Compile to get WASM
        const compileResult = await handleCompile(addAst);
        expect(compileResult.ok).toBe(true);
        expect(compileResult.wasm).toBeDefined();

        // Step 2: Package using handlePackageSkill
        const pkgResult = handlePackageSkill(addAst, compileResult.wasm!, {
            name: "AddSkill",
            version: "1.0.0",
            description: "Adds 3 + 4",
            author: "TestAgent",
        });

        expect(pkgResult.ok).toBe(true);
        expect(pkgResult.skill).toBeDefined();

        const skill = pkgResult.skill as any;
        expect(skill.uasf).toBe("1.0");
        expect(skill.metadata.name).toBe("AddSkill");
        expect(skill.metadata.version).toBe("1.0.0");
        expect(skill.interface.entryPoint).toBe("main");
        expect(skill.interface.returns.type).toBe("Int");
        expect(skill.binary.checksum).toMatch(/^sha256:/);
    });

    it("edict_package rejects module without main function", async () => {
        const compileResult = await handleCompile(noMainAst);
        // noMainAst has no "main" — but it has "helper" which check/compile will treat as entry
        // The compiler still compiles it, but packageSkill requires a "main" function
        // Note: check() and compile() don't require "main" — only the packager does
        if (compileResult.ok && compileResult.wasm) {
            const pkgResult = handlePackageSkill(noMainAst, compileResult.wasm);
            expect(pkgResult.ok).toBe(false);
            expect(pkgResult.error).toContain("main");
        }
    });

    it("edict_invoke_skill executes a packaged skill", async () => {
        // Compile and package
        const compileResult = await handleCompile(addAst);
        expect(compileResult.ok).toBe(true);
        const pkgResult = handlePackageSkill(addAst, compileResult.wasm!);
        expect(pkgResult.ok).toBe(true);

        // Invoke via handleImportSkill (same as edict_invoke_skill handler)
        const invokeResult = await handleImportSkill(pkgResult.skill);
        expect(invokeResult.ok).toBe(true);
        expect(invokeResult.exitCode).toBe(0);
    });

    it("round-trip: compile → package → serialize → invoke", async () => {
        // Compile
        const compileResult = await handleCompile(addAst);
        expect(compileResult.ok).toBe(true);

        // Package
        const pkgResult = handlePackageSkill(addAst, compileResult.wasm!, {
            name: "RoundTrip",
        });
        expect(pkgResult.ok).toBe(true);

        // Serialize to JSON and back (simulates storage in agent memory)
        const serialized = JSON.stringify(pkgResult.skill);
        const deserialized = JSON.parse(serialized);

        // Invoke from deserialized package
        const invokeResult = await handleImportSkill(deserialized);
        expect(invokeResult.ok).toBe(true);
        expect(invokeResult.exitCode).toBe(0);
    });

    it("edict_invoke_skill rejects skill with bad checksum", async () => {
        const compileResult = await handleCompile(addAst);
        expect(compileResult.ok).toBe(true);
        const pkgResult = handlePackageSkill(addAst, compileResult.wasm!);
        expect(pkgResult.ok).toBe(true);

        // Tamper with checksum
        const tampered = JSON.parse(JSON.stringify(pkgResult.skill));
        tampered.binary.checksum = "sha256:badf00d";

        const invokeResult = await handleImportSkill(tampered);
        expect(invokeResult.ok).toBe(false);
        expect(invokeResult.error).toContain("Checksum mismatch");
    });

    it("version features includes skillPackages", () => {
        const version = handleVersion();
        expect(version.features.skillPackages).toBe(true);
    });
});
