// =============================================================================
// Type Environment — Type bindings for the type checker
// =============================================================================

import type { TypeExpr } from "../ast/types.js";
import type { TypeDef, RecordDef, EnumDef, ToolDef } from "../ast/nodes.js";

export class TypeEnv {
    private bindings: Map<string, TypeExpr> = new Map();
    private typeDefs: Map<string, TypeDef | RecordDef | EnumDef> = new Map();
    private toolDefs: Map<string, ToolDef> = new Map();
    private parent: TypeEnv | null;

    constructor(parent: TypeEnv | null = null) {
        this.parent = parent;
    }

    bind(name: string, type: TypeExpr): void {
        this.bindings.set(name, type);
    }

    getType(name: string): TypeExpr | undefined {
        const local = this.bindings.get(name);
        if (local) return local;
        return this.parent?.getType(name);
    }

    registerTypeDef(name: string, def: TypeDef | RecordDef | EnumDef): void {
        this.typeDefs.set(name, def);
    }

    lookupTypeDef(name: string): TypeDef | RecordDef | EnumDef | undefined {
        const local = this.typeDefs.get(name);
        if (local) return local;
        return this.parent?.lookupTypeDef(name);
    }

    registerToolDef(name: string, def: ToolDef): void {
        this.toolDefs.set(name, def);
    }

    lookupToolDef(name: string): ToolDef | undefined {
        const local = this.toolDefs.get(name);
        if (local) return local;
        return this.parent?.lookupToolDef(name);
    }

    /**
     * Resolve a named type alias to its underlying definition.
     * If the type is `Named("Foo")` and Foo is a TypeDef, returns the definition type.
     * Built-in enums Option and Result resolve to their concrete type kinds
     * so that Named("Option") matches { kind: "option" } and Named("Result") matches { kind: "result" }.
     * Otherwise returns the type as-is.
     */
    resolveAlias(type: TypeExpr): TypeExpr {
        if (type.kind !== "named") return type;

        // Built-in enum aliases — resolve Named to concrete type kinds
        if (type.name === "Option") {
            return { kind: "option", inner: { kind: "basic", name: "Int" } };
        }
        if (type.name === "Result") {
            return { kind: "result", ok: { kind: "basic", name: "Int" }, err: { kind: "basic", name: "Int" } };
        }

        const def = this.lookupTypeDef(type.name);
        if (!def) return type; // unknown — treated as opaque
        if (def.kind === "type") {
            // TypeDef: recurse in case of chained aliases
            return this.resolveAlias(def.definition);
        }
        // RecordDef or EnumDef: Named("X") is the de-facto type
        return type;
    }

    /**
     * Collect all type definition names of a specific kind, walking the parent chain.
     */
    allTypeDefNames(kind: "record" | "enum" | "type"): string[] {
        const names = new Set<string>();
        for (const [name, def] of this.typeDefs) {
            if (def.kind === kind) names.add(name);
        }
        if (this.parent) {
            for (const n of this.parent.allTypeDefNames(kind)) {
                names.add(n);
            }
        }
        return [...names];
    }

    child(): TypeEnv {
        return new TypeEnv(this);
    }
}
