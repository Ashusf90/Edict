# PRD: Expand Edict Code Examples

## Overview
Edict currently ships 18 example programs covering the basics of the language. However, a significant portion of the language's functionality — builtin domains, type system features, expression types, and compiler pipeline stages — lacks dedicated examples. This effort will create new examples to achieve near-complete coverage of Edict's capabilities, giving agents a comprehensive reference when learning to write Edict programs.

### Current State
- **18 examples** across 3 difficulty tiers (4 beginner, 8 intermediate, 6 advanced)
- **15 builtin domains** in the compiler, only ~5 exercised by examples
- Key features with **zero example coverage**: Option types, tuples, Int64, constants, block expressions, string interpolation, type conversions, datetime, random, crypto, HTTP

### Goal
Expand the examples suite from 18 → ~35+ programs, ensuring every major language feature and builtin domain has at least one dedicated example. Each example must compile, pass `edict_check`, and execute successfully via `edict_run`.

---

## Task 1: Option Type Example
Create an example demonstrating `Option<T>` usage.
- `Option<Int>` type declarations
- `Some` and `None` construction via `enum_constructor`
- Pattern matching on `Option` with `match`
- Builtin helpers: `isSome`, `isNone`, `unwrapOr`
- Chaining option operations

## Task 2: Tuples Example
Create an example focusing on tuple types and expressions.
- `tuple` type declarations with heterogeneous elements
- `tuple_expr` construction
- Tuple field access
- Returning tuples from functions
- Tuples as function parameters

## Task 3: Int64 Example
Create an example demonstrating 64-bit integer operations.
- `Int64` basic type usage
- Int64 arithmetic builtins
- Type conversion between `Int` and `Int64`
- Demonstrating when Int64 is needed vs Int

## Task 4: Constants Example
Create an example using top-level `const` definitions.
- `ConstDef` with various types (Int, String, Bool, Float)
- Using constants in function bodies
- Constants as function arguments
- Constants with computed values

## Task 5: Block Expressions Example
Create an example demonstrating `block` expressions.
- `BlockExpr` with multiple statements
- Last expression as return value
- Nested blocks
- Blocks inside `let` bindings
- Blocks as function bodies

## Task 6: String Interpolation Example
Create an example demonstrating `string_interp` nodes.
- Basic string interpolation with variables
- Interpolation with expressions
- Nested interpolation
- Combining with string builtins

## Task 7: Type Conversions Example
Create an example demonstrating type conversion builtins.
- `intToFloat`, `floatToInt`
- `intToString`, `floatToString`, `boolToString`
- `stringToInt`, `stringToFloat`
- Chaining conversions in a pipeline

## Task 8: Math Builtins Example
Create an example exercising the math domain builtins.
- `abs`, `min`, `max`
- `power`, `sqrt`
- `floor`, `ceil`, `round`
- Using math builtins with contracts (e.g., `pre: x >= 0` for `sqrt`)

## Task 9: Array Operations Example
Create a comprehensive array operations example.
- `array_length`, `array_get`, `array_set`
- `array_push`, `array_concat`
- `array_slice`, `array_contains`
- `array_map`, `array_filter`, `array_reduce` with lambdas
- Combining multiple array operations in a pipeline

## Task 10: Datetime Builtins Example
Create an example demonstrating datetime operations.
- `now`, `dateToString`
- Date arithmetic if supported
- Formatting and parsing

## Task 11: Random Builtins Example
Create an example using random number generation.
- `randomInt`, `randomFloat`
- Using random with effects (`reads` effect)
- Random within ranges

## Task 12: Unit Types Example
Expand beyond the existing `types.edict.json` with a dedicated unit types example.
- `currency<usd>`, `currency<eur>` — compile-time enforcement
- `distance<meters>`, `distance<miles>`
- Functions that accept/return unit types
- Demonstrating type errors when mixing units (show the contract/type safety)

## Task 13: Record Update Example
Create a dedicated example for functional record updates.
- `record_update` node
- Updating single fields
- Updating multiple fields
- Chaining updates
- Records with default values

## Task 14: Nested Pattern Matching Example
Create an advanced pattern matching example.
- Nested constructor patterns
- `binding` patterns to capture values
- `literal_pattern` matching
- Combining `wildcard` with specific patterns
- Match on nested enum/record structures

## Task 15: Crypto Builtins Example
Create an example demonstrating cryptographic operations.
- `sha256`, `md5` hash functions
- `hmac` operations
- Effects: declaring `pure` for crypto operations

## Task 16: IO and File Operations Example
Create an example demonstrating IO capabilities.
- `readFile`, `writeFile` builtins
- Proper `io` effect declarations
- Error handling with `Result` types for IO operations
- Combining IO with the effect system

## Task 17: HTTP Builtins Example
Create an example demonstrating HTTP operations.
- `httpGet`, `httpPost` builtins
- Proper `io` effect declarations
- Response handling
- Error handling for network operations

## Task 18: JSON Serialization Example
Expand beyond the existing `json.edict.json` (which models JSON data) to demonstrate JSON serialization builtins.
- `jsonParse`, `jsonStringify`
- Round-trip serialization
- Working with parsed JSON values

## Task 19: Advanced Contracts Example
Create a more comprehensive contracts example beyond the existing `contracts.edict.json`.
- Multiple preconditions on a single function
- Postconditions referencing parameters
- Contracts with `implies` operator
- Contracts on functions with complex types (records, arrays)
- Demonstrating counterexample feedback (deliberately failing contracts)

## Task 20: Typed Imports Example
Create an example demonstrating the typed imports feature.
- `import` with `types` field
- Cross-module type safety
- Effect declarations on imported functions
- Multiple typed imports from different modules

## Task 21: Effect Propagation Example
Create a dedicated example showing effect propagation through call chains.
- A pure function calling another pure function (valid)
- Effect propagation through call chains
- Multiple effects combining
- The `fails` effect with `Result` types

## Task 22: Regex Advanced Example
Expand beyond the existing regex example.
- `regex_match` with capturing groups
- `regex_replace` with replacement patterns
- Validation patterns (email, URL, etc.)
- Combining regex with string processing

---

## Verification Plan

### Automated
For each new example:
1. Run `edict_validate` — must pass with zero errors
2. Run `edict_check` — must pass type checking, effect checking, and contract verification
3. Run `edict_compile` — must produce valid WASM
4. Run `edict_run` — must execute successfully and produce expected output
5. Update `examples/README.md` with the new example in the correct difficulty tier

### Manual
- Review each example for pedagogical clarity — does it clearly demonstrate the target feature?
- Ensure no two examples redundantly cover the same feature without adding value
- Verify the README learning path includes new examples in logical order
