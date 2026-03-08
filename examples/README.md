# Edict Examples

Example programs demonstrating Edict's features, ordered from simplest to most complex.
Start with ⭐ **Beginner** examples to learn the basics, then progress through ⭐⭐ **Intermediate** and ⭐⭐⭐ **Advanced**.

## ⭐ Beginner

| Example | Features | Description |
|---------|----------|-------------|
| [hello](hello.edict.json) | `call`, `literal`, `io` effect | Minimal "Hello, World!" — the simplest valid program |
| [arithmetic](arithmetic.edict.json) | `fn`, `param`, `binop`, `unop`, `call` | Basic functions, binary/unary operators, function calls |
| [math](math.edict.json) | `abs`, `min`, `max`, `pow`, `sqrt`, `floor`, `ceil`, `round` | Math builtins with mixed Int/Float types and type conversion |
| [types](types.edict.json) | `type`, `unit_type`, `refined`, `tuple` | Type aliases, unit types, refinement types, tuples |
| [effects](effects.edict.json) | `pure`, `io`, `reads`, `writes`, `fails` | Effect declarations across pure and side-effecting functions |

## ⭐⭐ Intermediate

| Example | Features | Description |
|---------|----------|-------------|
| [modules](modules.edict.json) | `import`, multi-module | Importing from external modules (`math`, `io`) |
| [fibonacci](fibonacci.edict.json) | `if`, recursion | Recursive fibonacci with conditional branching |
| [contracts](contracts.edict.json) | `pre`, `post`, `implies` | Preconditions, postconditions, and logical implication |
| [closures](closures.edict.json) | `lambda`, `fn_type`, closure capture | Returning lambdas that capture outer scope variables |
| [dash-replace](dash-replace.edict.json) | `let`, `if`, `call`, string builtins | Iterative string processing with character replacement |
| [records](records.edict.json) | `record`, `record_expr`, `access` | Record definitions, field access, record construction |
| [enums](enums.edict.json) | `enum`, `match`, `variant`, pattern matching | Sum types with constructor patterns and wildcard arms |
| [option](option.edict.json) | `Option`, `enum_constructor`, `isSome`, `isNone`, `unwrapOr` | Option type construction, pattern matching, and utility builtins |
| [unit-types](unit-types.edict.json) | `unit_type`, semantic units | Semantic unit types preventing cross-unit arithmetic errors |
| [arrays](arrays.edict.json) | `array`, `array_length`, `array_get`, `array_push`, `array_concat` | Array builtins: create, query, mutate, slice, reverse |
| [constants](constants.edict.json) | `const`, `block`, `literal_pattern`, `and`, `or`, `not` | Constants, block expressions, literal pattern matching, boolean ops |
| [crypto](crypto.edict.json) | `sha256`, `md5`, `hmac` | Cryptographic hashing and HMAC authentication |
| [int64](int64.edict.json) | `intToInt64`, `int64ToInt`, `int64ToFloat`, `int64ToString` | 64-bit integer conversions and arithmetic |
| [json](json.edict.json) | `enum`, `match`, nested `enum_constructor` | JSON-like data model using recursive enum variants |

## ⭐⭐⭐ Advanced

| Example | Features | Description |
|---------|----------|-------------|
| [higher-order-functions](higher-order-functions.edict.json) | `fn_type`, `lambda`, `array_map`, `array_filter`, `array_reduce` | Functions as values: map, filter, reduce with lambdas |
| [result_error_handling](result_error_handling.edict.json) | `Result`, `enum_constructor`, `match`, `unwrapOkOr` | `Result<Ok,Err>` type for error handling with match and unwrap |
| [mutual-recursion](mutual-recursion.edict.json) | mutual recursion, `pre` contracts, `if` | Two functions (`isEven`/`isOdd`) calling each other recursively |
| [regex](regex.edict.json) | `regex_match`, `regex_replace`, string builtins | Regular expression matching and replacement |
| [datetime](datetime.edict.json) | `now`, `formatDate`, `parseDate`, `diffMs` | Date/time operations: timestamps, formatting, parsing, duration |
| [random](random.edict.json) | `randomInt`, `randomFloat`, `randomUuid` | Random number generation: dice rolls, floats, UUIDs |
| [io](io.edict.json) | `readFile`, `writeFile`, `env`, `args`, `Result` matching | File I/O with Result error handling, environment access |
| [string-processing](string-processing.edict.json) | multiple string builtins, `let` chains, `if` | Comprehensive string manipulation pipeline |
| [complete](complete.edict.json) | all features combined | Kitchen-sink example: records, enums, contracts, lambdas, HOFs, imports |

## Recommended Learning Path

1. **Start here:** `hello` → `arithmetic` → `math` → `types` → `effects`
2. **Core language:** `modules` → `fibonacci` → `contracts` → `constants` → `records` → `enums`
3. **Data structures:** `arrays` → `option` → `unit-types`
4. **Functional patterns:** `closures` → `higher-order-functions` → `json`
5. **Error handling:** `result_error_handling`
6. **String & regex:** `dash-replace` → `string-processing` → `regex`
7. **Advanced:** `mutual-recursion` → `complete`
