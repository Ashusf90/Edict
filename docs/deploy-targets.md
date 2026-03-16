# Deploy Targets

Edict programs compile to WASM and can be deployed to edge runtimes via the `edict_deploy` MCP tool.

## Available Targets

### `wasm_binary`

Returns the compiled WASM binary (base64) and metadata. No external service required.

**Result fields:**
- `wasm` — base64-encoded WASM binary
- `wasmSize` — binary size in bytes
- `verified` — whether all contracts were proven
- `effects` — declared effects
- `contracts` — number of contracts
- `status` — always `"ready"`

### `cloudflare`

Generates (and optionally deploys) a Cloudflare Worker bundle.

**Live deployment** requires two environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token with Workers write permission |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account identifier |

**Behavior:**
- **Credentials set**: Uploads to Cloudflare Workers API → `status: "live"`, real URL
- **Credentials absent**: Returns bundle files → `status: "bundled"`, provisional URL, `credentialsRequired` field lists missing env vars

**Config options:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Worker name (used in URL). Falls back to module name. |
| `route` | `string` | Route suffix (e.g., `/api/process`) appended to Worker URL |
| `compatibilityDate` | `string` | Wrangler compatibility date (default: `"2024-01-01"`) |
| `kvNamespaces` | `array` | KV namespace bindings: `[{ binding, id }]` |

**Bundle files (when bundled):**
- `worker.js` — ES Module Worker entry point with all host imports inline
- `program.wasm` — compiled WASM binary (base64-encoded)
- `wrangler.toml` — Wrangler v3 configuration

## Example

```json
{
  "tool": "edict_deploy",
  "args": {
    "ast": { "kind": "module", "id": "mod-1", "name": "api", "..." : "..." },
    "target": "cloudflare",
    "config": { "name": "my-api", "route": "/v1/process" }
  }
}
```

**Live response** (credentials set):
```json
{
  "ok": true,
  "target": "cloudflare",
  "wasmSize": 2048,
  "verified": true,
  "effects": ["pure"],
  "contracts": 2,
  "url": "https://my-api.workers.dev/v1/process",
  "status": "live"
}
```

**Bundled response** (no credentials):
```json
{
  "ok": true,
  "target": "cloudflare",
  "bundle": [
    { "path": "worker.js", "content": "..." },
    { "path": "program.wasm", "content": "AGFzbQ..." },
    { "path": "wrangler.toml", "content": "name = \"my-api\"\n..." }
  ],
  "wasmSize": 2048,
  "url": "https://my-api.workers.dev/v1/process",
  "status": "bundled",
  "credentialsRequired": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]
}
```

## Adding New Deploy Targets

Deploy targets are handled in the `handleDeploy` function (`src/mcp/handlers.ts`). To add a new target:

1. Create an API client in `src/deploy/` (see `cloudflare-api.ts` for reference)
2. Add a `case` branch in `handleDeploy`'s target switch
3. Add the target to `validTargets` in the default error case
4. Export types from `src/index.ts`
5. Update `deploy.ts` tool description to list the new target
6. Add tests in `tests/deploy/`

All deploy targets must:
- Use environment variables for credentials (never config files)
- Return structured errors (never prose)
- Include `wasmSize`, `verified`, `effects`, and `contracts` metadata
