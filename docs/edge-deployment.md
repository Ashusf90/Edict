# Deploying Edict to Cloudflare Workers

This guide walks through the full pipeline: write an Edict program → compile → deploy to Cloudflare Workers → invoke.

## Prerequisites

| Requirement | How to get it |
|-------------|---------------|
| `edict-lang` | `npm install edict-lang` or `npx edict-lang` |
| Cloudflare account | [sign up](https://dash.cloudflare.com/sign-up) |
| API token | [create token](https://dash.cloudflare.com/profile/api-tokens) with **Workers Scripts: Edit** permission |
| Account ID | Dashboard → Overview → right sidebar → "Account ID" |

Set credentials as environment variables:

```bash
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

## Step 1: Write the Program

Use `edict_schema` or `edict_examples` to learn the AST format, then write your program as JSON AST.

See [`examples/edge-api-handler.edict.json`](../examples/edge-api-handler.edict.json) for a complete example: a string transformation service with contracts.

## Step 2: Deploy

Call `edict_deploy` with `target: "cloudflare"`:

```json
{
    "tool": "edict_deploy",
    "args": {
        "ast": { "kind": "module", "..." : "..." },
        "target": "cloudflare",
        "config": {
            "name": "my-api",
            "route": "/v1/process"
        }
    }
}
```

### Two Modes

**Live deployment** (credentials set):

The tool compiles the program, generates a Worker bundle, and uploads it to the Cloudflare Workers API.

```json
{
    "ok": true,
    "target": "cloudflare",
    "url": "https://my-api.workers.dev/v1/process",
    "status": "live",
    "wasmSize": 2048,
    "verified": true,
    "effects": ["io"],
    "contracts": 2
}
```

**Bundle-only** (no credentials):

The tool generates the Worker bundle files without deploying. Deploy manually with `wrangler deploy`.

```json
{
    "ok": true,
    "target": "cloudflare",
    "bundle": [
        { "path": "worker.js", "content": "..." },
        { "path": "program.wasm", "content": "AGFzbQ..." },
        { "path": "wrangler.toml", "content": "name = \"my-api\"\n..." }
    ],
    "status": "bundled",
    "credentialsRequired": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]
}
```

To deploy the bundle manually:
1. Write the bundle files to a directory
2. Run `npx wrangler deploy` from that directory

## Step 3: Invoke

Once deployed, invoke the service with `edict_invoke` or a direct HTTP request:

```json
{
    "tool": "edict_invoke",
    "args": {
        "url": "https://my-api.workers.dev/v1/process",
        "input": "hello"
    }
}
```

Or with `curl`:

```bash
curl -X POST https://my-api.workers.dev/v1/process -d "hello"
```

## Config Options

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Worker name (used in URL). Falls back to module name. |
| `route` | `string` | Route suffix appended to Worker URL |
| `compatibilityDate` | `string` | Wrangler compatibility date (default: `"2024-01-01"`) |
| `kvNamespaces` | `array` | KV namespace bindings: `[{ binding, id }]` |

## Architecture

The generated Worker bundle contains:

- **`worker.js`** — ES Module Worker with all host import functions inline, derived from the builtin registry at generation time
- **`program.wasm`** — compiled WASM binary
- **`wrangler.toml`** — Wrangler v3 configuration

The Worker handles an HTTP request by:
1. Instantiating the WASM module with host import functions
2. Calling `main()`
3. Collecting `print` output as the response body
4. Returning the output as an HTTP response

### Host Function Behavior in Workers

| Category | Behavior |
|----------|----------|
| Core (`print`, `println`) | Accumulates into response body |
| String, Math, Array, Option, Result | Fully functional (synchronous) |
| Crypto (`sha256`, `md5`) | Returns empty string (Workers `crypto.subtle` is async) |
| HTTP (`httpGet`, `httpPost`) | Returns `Err` Result (Workers `fetch` is async) |
| IO (`readFile`, `writeFile`) | Returns `Err` Result (Workers KV is async) |
| `env` | Reads from Workers environment bindings |
| Random | Functional via `Math.random()` / `crypto.randomUUID()` |

## Related Documentation

- [Deploy Targets](deploy-targets.md) — `wasm_binary` and `cloudflare` target reference, adding new targets
- [CloudflareHostAdapter](../src/deploy/scaffold.ts) — Worker scaffold generator source
- [Cloudflare API client](../src/deploy/cloudflare-api.ts) — Workers Script API upload implementation
