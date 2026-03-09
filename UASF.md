# Universal Agent Skill Format (UASF) Specification v1.0

The **Universal Agent Skill Format (UASF)** is an open-standard format for packaging agent capabilities as verifiable, highly portable WebAssembly (WASM) modules. It defines a standard JSON manifest combined with a base64-encoded WASM executable. 

UASF aims to solve the fragmented ecosystem of agent capabilities by defining skills not as arbitrary Python or Node.js scripts, but as standalone WASM functions with strict schemas, verifiable contracts, and explicit capabilities.

## Motivation

Agents store knowledge and capabilities in various text-based formats (prompts, raw code snippets, embeddings). This entails several problems:
1. **Ambiguity:** "Parse CSV" could mean anything.
2. **Un-verifiability:** It takes runtime execution to catch errors.
3. **Execution Overhead:** Agent code regeneration consumes tokens and time.

UASF represents **Crystallized Intelligence**—storing a capability as a tiny, deterministic, formally-proven unit of computation.

## Package Structure

A UASF package is a standard JSON object containing the following top-level fields:

```json
{
  "uasf": "1.0",
  "metadata": {
    "name": "csv_parser",
    "version": "1.0.0",
    "description": "Parse a CSV string into a structured array of records",
    "author": "agent://data-specialist-v3",
    "license": "MIT",
    "tags": ["csv", "parsing", "data"],
    "createdAt": "2026-03-09T00:00:00Z"
  },
  "binary": {
    "wasm": "AGFzbQEAAAA...",
    "wasmSize": 2048,
    "checksum": "sha256:abc123def456..."
  },
  "interface": {
    "entryPoint": "main",
    "params": [
      { "name": "input", "type": "String", "description": "CSV text to parse" }
    ],
    "returns": { "type": "Array" },
    "effects": ["pure"]
  },
  "verification": {
    "verified": true,
    "contracts": [
      {
        "kind": "pre",
        "condition": { "kind": "binop", "op": ">", "left": "...", "right": "..." }
      }
    ],
    "provenBy": "z3-solver"
  },
  "capabilities": {
    "required": [],
    "optional": ["io:stdout"]
  }
}
```

### 1. `uasf`
Denotes the version of the Universal Agent Skill Format used. Currently `"1.0"`.

### 2. `metadata`
Describes the software package, authors, versioning, and searchable tags. This powers the UASF package registries.

### 3. `binary`
Embeds the actual self-contained execution binary.
- `wasm`: The compiled skill module encoded as a `base64` string.
- `wasmSize`: Number of bytes for the underlying WASM module.
- `checksum`: Integrity checksum (typically prefixed with `sha256:`).

### 4. `interface`
Declares the interaction surface for the host or agent framework.
- `entryPoint`: The exported WASM function corresponding to the entry API (usually `"main"`).
- `params`: An array specifying named constraints for the input arguments.
- `returns`: The output type declaration.
- `effects`: Declared side-effects (e.g., `"pure"`, `"io"`, `"reads"`, `"writes"`, `"fails"`).

### 5. `verification`
Records how and if the code was formally verified for semantic correctness. Edict explicitly relies on the Z3 theorem prover. This acts as the "proof text" representing guarantees about the skill.

### 6. `capabilities`
Outlines sandbox capabilities required for host execution (like stdout IO, filesystem subsets, or HTTP subsets).

## Export and Import via MCP

Edict natively supports UASF package export and import via the Model Context Protocol (MCP):
- **`edict_export`**: Transforms a JSON AST into a UASF 1.0 package payload. It validates, checks, and compiles the code prior to extracting the manifest.
- **`edict_import_skill`**: Imports a UASF JSON payload. It acts as an execution host—checking checksums, enforcing sandboxed `RunLimits`, and executing the underlying capability directly.
