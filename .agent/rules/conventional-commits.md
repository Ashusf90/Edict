# Conventional Commits

All git commits MUST use the [Conventional Commits](https://www.conventionalcommits.org/) format. This is **required** — release-please parses commit messages to determine version bumps and generate changelogs.

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

| Type | When to use | Version bump |
|---|---|---|
| `feat` | New feature or capability | **minor** |
| `fix` | Bug fix | **patch** |
| `feat!` or `fix!` | Breaking change (append `!`) | **major** |
| `refactor` | Code change that neither fixes a bug nor adds a feature | none |
| `test` | Adding or updating tests | none |
| `docs` | Documentation only | none |
| `chore` | Maintenance, deps, CI config | none |
| `ci` | CI/CD changes | none |
| `perf` | Performance improvement | **patch** |

## Rules

1. **Type is mandatory** — never commit without a type prefix
2. **Description must be lowercase** — `feat: add string_replace builtin` not `feat: Add String_Replace Builtin`
3. **Use scope for clarity when helpful** — `fix(checker): handle union narrowing` or `feat(codegen): emit memory instructions`
4. **Breaking changes** — either append `!` after type/scope OR include `BREAKING CHANGE:` in the footer
5. **Keep descriptions concise** — one line, imperative mood, no period at end
6. **Body for context** — if the "why" isn't obvious from the description, add a body

## Examples

```
feat: add string_replace builtin
fix(resolver): resolve nested generic type parameters
refactor(checker)!: restructure effect inference pipeline
docs: update README with MCP server usage
chore: bump binaryen to v126
test(contracts): add coverage for array preconditions

feat(codegen): support multi-return WASM functions

This enables functions to return multiple values via WASM multi-value
proposal, which is needed for tuple destructuring.

BREAKING CHANGE: compile() now returns ArrayBuffer instead of Uint8Array
```
