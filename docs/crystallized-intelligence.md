# Crystallized Intelligence — Verified Skills as Agent Memory

> Edict turns agent computations into **crystallized intelligence**: verified, deterministic WASM binaries that execute in microseconds with zero inference cost.

## The Pattern

Agents store knowledge and capabilities as text — natural language descriptions, code snippets, vector embeddings. This has fundamental problems:

- **Text is ambiguous** — "parse CSV" could mean many things
- **Text is un-verifiable** — you can't prove a text description is correct
- **Text must be re-interpreted** — every retrieval re-parses and re-compiles
- **Text can hallucinate** — regenerated code may differ from the original

**Crystallized intelligence** replaces text-based capability storage with **verified WASM binaries** — tiny, deterministic, formally proven units of computation.

| Property | Text | Crystallized Skill |
|----------|:----:|:------------------:|
| Size | ~1KB description | ~2-10KB binary |
| Execution speed | Requires compilation | Microseconds |
| Correctness guarantee | None | Contract-verified |
| Determinism | Re-generation varies | Bit-identical every run |
| Hallucination risk | High on regeneration | Zero (compiled artifact) |
| Portability | Language-dependent | Any WASM runtime |
| Composability | Fragile | Typed imports/exports |

## How It Works

```
Agent writes Edict AST (JSON)
  → check(): validate, resolve names, type-check, verify effects, prove contracts
  → compile(): generate WASM binary
  → packageSkill(): create SkillPackage with interface metadata, verification info, checksum
  → store in memory (Mem0, LangChain, Redis, S3, ...)
  ↓
Later: agent needs the same computation
  → retrieve SkillPackage from memory
  → invokeSkill(): verify checksum, execute WASM
  → result in microseconds, zero tokens spent
```

## The SkillPackage Format

Every crystallized skill is a `SkillPackage` (UASF 1.0 format) — a self-describing, portable bundle:

```json
{
  "uasf": "1.0",
  "metadata": {
    "name": "fibonacci",
    "version": "1.0.0",
    "description": "Fibonacci with verified contracts",
    "author": "agent-001",
    "createdAt": "2026-03-12T20:00:00.000Z",
    "tags": []
  },
  "binary": {
    "wasm": "<base64-encoded WASM>",
    "wasmSize": 248,
    "checksum": "sha256:a1b2c3d4..."
  },
  "interface": {
    "entryPoint": "main",
    "params": [],
    "returns": { "type": "Int" },
    "effects": ["pure"]
  },
  "verification": {
    "verified": true,
    "contracts": [
      { "kind": "pre", "condition": { "kind": "binop", "op": ">=", ... } },
      { "kind": "post", "condition": { "kind": "binop", "op": ">=", ... } }
    ],
    "provenBy": "z3-solver"
  },
  "capabilities": {
    "required": [],
    "optional": []
  }
}
```

Key properties:
- **`binary.checksum`** — SHA-256 integrity check, verified before execution
- **`verification.verified`** — `true` if all contracts were proven by Z3
- **`interface`** — typed entry point for invocation
- **`capabilities.required`** — declares what the skill needs (e.g., `["io"]`)

## Using the Library API

```javascript
import { check, compile, packageSkill, invokeSkill } from "edict-lang";

// 1. Compile the program
const checkResult = await check(ast);
const compileResult = compile(checkResult.module, { typeInfo: checkResult.typeInfo });

// 2. Crystallize into a skill
const pkgResult = packageSkill({
    module: checkResult.module,
    wasm: compileResult.wasm,
    coverage: checkResult.coverage,
    metadata: { name: "mySkill", description: "Does X" },
});

// 3. Store (JSON-serializable)
const json = JSON.stringify(pkgResult.skill);
await memoryStore.save("skill:mySkill", json);

// 4. Retrieve and invoke (later, zero compilation)
const stored = JSON.parse(await memoryStore.get("skill:mySkill"));
const result = await invokeSkill(stored);
// result.returnValue, result.output, result.exitCode
```

## Using MCP Tools

Agents using Edict via MCP can crystallize skills without library imports:

```
Agent → edict_compile({ ast: {...} })
      → edict_package({ ast: {...} })   // returns SkillPackage JSON
      → store in agent memory

Later:
Agent → edict_invoke_skill({ skill: <stored package> })
      → result in microseconds
```

## Integration with Memory Frameworks

### Mem0

Store skills as structured memories with semantic search:

```javascript
import { MemoryClient } from "mem0ai";

const client = new MemoryClient({ apiKey: "..." });

// Store a crystallized skill
await client.add([{
    role: "assistant",
    content: `Crystallized skill: ${skill.metadata.name} — ${skill.metadata.description}`,
}], {
    user_id: "agent-001",
    metadata: {
        type: "edict_skill",
        skill_package: JSON.stringify(skill),
        verified: skill.verification.verified,
        effects: skill.interface.effects,
    },
});

// Retrieve by semantic search
const memories = await client.search("fibonacci computation", { user_id: "agent-001" });
const skillMemory = memories.find(m => m.metadata?.type === "edict_skill");
const skill = JSON.parse(skillMemory.metadata.skill_package);
const result = await invokeSkill(skill);
```

### LangChain Memory

Use a vector store for skill discovery:

```javascript
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";

const store = await MemoryVectorStore.fromTexts(
    skills.map(s => `${s.metadata.name}: ${s.metadata.description}`),
    skills.map(s => ({ skill_package: JSON.stringify(s) })),
    new OpenAIEmbeddings(),
);

// Search for relevant skills
const results = await store.similaritySearch("calculate fibonacci", 1);
const skill = JSON.parse(results[0].metadata.skill_package);
const result = await invokeSkill(skill);
```

### Custom Stores

SkillPackages are plain JSON — store them anywhere:

```javascript
// Redis
await redis.set(`skill:${skill.metadata.name}`, JSON.stringify(skill));
const stored = JSON.parse(await redis.get("skill:fibonacci"));

// SQLite
db.run("INSERT INTO skills (name, package) VALUES (?, ?)",
    skill.metadata.name, JSON.stringify(skill));

// S3
await s3.putObject({
    Bucket: "agent-skills",
    Key: `${skill.metadata.name}.uasf.json`,
    Body: JSON.stringify(skill),
});

// File system
import { writeFileSync, readFileSync } from "fs";
writeFileSync("skills/fibonacci.uasf.json", JSON.stringify(skill, null, 2));
const loaded = JSON.parse(readFileSync("skills/fibonacci.uasf.json", "utf-8"));
```

## Why This Matters

**Instead of re-thinking, re-execute.** An agent builds up a library of verified skills over time. Each successful computation gets crystallized. The agent's effective intelligence grows monotonically because verified computations never regress.

This is unique to Edict because:
1. **Formal verification** proves the skill is correct (Z3 contracts)
2. **WASM** ensures portability across any runtime
3. **Effect system** declares what the skill needs (`pure` skills need nothing)
4. **Integrity checking** prevents tampering (SHA-256 checksums)
5. **Typed interfaces** enable safe composition

## Example: Skill Lifecycle

See [`examples/skill-lifecycle/skill-lifecycle.ts`](../examples/skill-lifecycle/skill-lifecycle.ts) for a runnable demonstration that:

1. Compiles 3 progressively complex programs
2. Crystallizes each into a SkillPackage
3. Invokes from the library with JSON round-trip
4. Compares compilation vs invocation performance

Run it:
```bash
npx tsx examples/skill-lifecycle/skill-lifecycle.ts
```
