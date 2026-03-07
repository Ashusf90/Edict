# Agent Feedback Crosscheck — Edict Repo

Audit of external agent review recommendations against current codebase state.

## Legend
- ✅ **Done** — already implemented
- ⚠️ **Partial** — partly addressed, room to improve
- ❌ **Not done** — still outstanding
- 🚫 **Won't do** — intentionally rejected (with rationale)

---

## Discoverability

| # | Recommendation | Status | Evidence / Notes |
|---|---|---|---|
| 1 | **GitHub topics/tags** | ❌ | `package.json` has excellent npm keywords (`ai-agents`, `mcp`, `wasm`, `formal-verification`, `json-ast`, etc.) but **GitHub repo topics are not set** ([check repo Settings → Topics](https://github.com/Sowiedu/Edict)). These are different things — npm keywords help npm search, GitHub topics help GitHub search and browsing. |
| 2 | **GitHub description** (one-liner) | ⚠️ | Not confirmed from API, but likely defaults to the `package.json` description. Worth verifying it's set explicitly in GitHub repo settings. |
| 3 | **`llms.txt` file** | ❌ | No `llms.txt` at repo root. This is the [llmstxt.org](https://llmstxt.org) convention for AI discoverability. |
| 4 | **Publish MCP server to registry** | ⚠️ | npm package `edict-lang` exists (`edict-lang-0.1.0.tgz` in repo). Unclear if published to npm or listed in MCP server directories. |

---

## Clarity / AI-Readability

| # | Recommendation | Status | Evidence / Notes |
|---|---|---|---|
| 5 | **README: lead with concrete example** | ✅ | README shows the pipeline diagram (lines 12-27), then Hello World JSON AST example (lines 83-116), then the agent loop code (lines 118-142). The example comes before the architecture section. |
| 6 | **AGENTS.md or CLAUDE.md** | ❌ | Neither file exists. The `.agent/skills/` directory has skill files (`edict-program-writer`, `edict-compiler-dev`) which serve a similar purpose *for agents that know to look there*, but there's no standard `AGENTS.md` at repo root for generic AI agent consumption. |
| 7 | **JSON Schema as primary reference** | ✅ | Schema is linked prominently — `edict_schema` tool is listed first in MCP tools table, `edict://schema` is first resource, and there's a `edict://schema/minimal` variant for token efficiency. |
| 8 | **Minimal examples per feature** | ⚠️ | 18 examples exist in `examples/` but there's no indication in the filenames or README which are minimal vs. complex. The agent reviewer's specific request was: *"I don't know which ones are minimal vs. complex."* A difficulty annotation or ordering would help. |

---

## Token Efficiency

| # | Recommendation | Status | Evidence / Notes |
|---|---|---|---|
| 9 | **Compact schema** | ✅ | `edict_schema` tool accepts `format: "full" | "minimal" | "compact"`. The `"minimal"` format strips descriptions. The `"compact"` format returns the compact key/kind mapping reference from [expand.ts](file:///Users/patrickprobst/Downloads/Edict/src/compact/expand.ts). |
| 10 | **Self-contained MCP tool descriptions** | ✅ | All 10 tools have inline descriptions with parameter-level docs via Zod `.describe()`. The `edict_run` tool even documents sandbox behavior inline. Prompts (`write_program`, `fix_error`, etc.) include inline schema, examples, and builtin lists so agents don't need extra fetches. |
| 11 | **Short node type names / avoid deep nesting** | ✅ | Fully implemented via the **compact AST format** in [expand.ts](file:///Users/patrickprobst/Downloads/Edict/src/compact/expand.ts). Compact kind abbreviations (`lit`, `bin`, `id`, `c`, `fn`, `lam`, etc.) and key abbreviations (`k`, `i`, `n`, `v`, `b`, `rt`, etc.) are auto-expanded by the compiler. ASTs using `{"k":"lit","i":"x","v":42}` instead of `{"kind":"literal","id":"x","value":42}` are accepted by all tools. |
| 12 | **Cheat sheet (~500 tokens)** | ❌ | No standalone cheat sheet file exists. The `write_program` prompt includes a mini-bootstrap (schema + example + builtins), but there's no dedicated resource or MCP tool for a ~500-token "80% coverage" reference. |
| 13 | **Error messages include fix templates** | ✅ | Structured errors include `FixSuggestion` objects (with `nodeId`, `field`, `value` — the concrete patch). Multiple error types attach these: `UndefinedReferenceError`, `TypeMismatchError`, `EffectViolationError`, `UnknownFieldError`, `MissingRecordFieldsError`, etc. The error catalog also includes `example_fix` entries for every error type. Agents can copy-paste the suggestion directly into `edict_patch`. |

---

## Summary: What Remains

### Quick wins (can be done now)

| Priority | Item | Effort |
|---|---|---|
| 🔴 High | **Add GitHub topics** — `ai-agents`, `programming-language`, `mcp`, `wasm`, `formal-verification`, `json-ast`, `compiler`, `llm` | 2 min (Settings → Topics) |
| 🔴 High | **Create `llms.txt`** at repo root | 15 min |
| 🟡 Medium | **Create cheat sheet** — a ~500 token quick-ref (MCP resource `edict://cheatsheet` + standalone file) | 30 min |
| 🟡 Medium | **Annotate examples** with difficulty/scope tags in README or a manifest | 15 min |
| 🟢 Low | **Create `AGENTS.md`** at repo root (could largely point to existing skill files) | 20 min |

### Already well-handled

- ✅ Compact AST format with short keys/kinds
- ✅ Self-contained MCP tool descriptions
- ✅ Error messages with fix suggestions/templates
- ✅ Minimal schema variant for token efficiency
- ✅ README structure (example before architecture)
- ✅ npm keywords
- ✅ MCP prompts with inline bootstrap content

> [!TIP]
> The reviewer's **biggest** remaining gap is **discoverability** — GitHub topics and `llms.txt` are both zero-effort items that significantly increase the chance of the project being found by AI agents and developers. The token efficiency suggestions have already been thoroughly addressed by the compact AST system.
