// =============================================================================
// Built-in Enum Definitions — shared across resolver, checker, and codegen
// =============================================================================
// Single source of truth for Option and Result enum structures.
// Any change here propagates to all pipeline stages automatically.

import type { EnumDef } from "../ast/nodes.js";
import { INT_TYPE } from "../ast/type-constants.js";

/**
 * Built-in Option enum: None | Some(value: Int)
 */
export const OPTION_ENUM_DEF: EnumDef = {
    kind: "enum",
    id: "__builtin_option",
    name: "Option",
    variants: [
        { kind: "variant", id: "__builtin_option_none", name: "None", fields: [] },
        {
            kind: "variant", id: "__builtin_option_some", name: "Some", fields: [
                { kind: "field", id: "__builtin_option_some_value", name: "value", type: INT_TYPE },
            ],
        },
    ],
};

/**
 * Built-in Result enum: Ok(value: Int) | Err(error: Int)
 */
export const RESULT_ENUM_DEF: EnumDef = {
    kind: "enum",
    id: "__builtin_result",
    name: "Result",
    variants: [
        {
            kind: "variant", id: "__builtin_result_ok", name: "Ok", fields: [
                { kind: "field", id: "__builtin_result_ok_value", name: "value", type: INT_TYPE },
            ],
        },
        {
            kind: "variant", id: "__builtin_result_err", name: "Err", fields: [
                { kind: "field", id: "__builtin_result_err_error", name: "error", type: INT_TYPE },
            ],
        },
    ],
};

/** All built-in enum definitions. */
export const BUILTIN_ENUMS: readonly EnumDef[] = [OPTION_ENUM_DEF, RESULT_ENUM_DEF];
