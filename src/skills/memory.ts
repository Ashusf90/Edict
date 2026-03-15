// =============================================================================
// Skill Memory — in-memory store for UASF skill packages with keyword search
// =============================================================================
// Reference implementation of a skill memory adapter. Stores skill packages,
// retrieves them by keyword search on metadata (name, description, tags),
// and executes them from memory via invokeSkill().
//
// This is a zero-dependency, in-memory implementation. Agent developers
// integrating with external memory systems (Mem0, LangChain) can use
// toJSON()/fromJSON() for persistence and bring their own embedding layer
// for semantic search.

import type { Effect } from "../ast/nodes.js";
import type { RunLimits } from "../codegen/runner.js";
import type { UasfParam } from "../mcp/uasf.js";
import { invokeSkill } from "./invoke.js";
import type { SkillPackage, InvokeSkillResult } from "./types.js";

/**
 * Summary of a skill returned by search() and list().
 * Contains metadata for selection without the full WASM binary.
 */
export interface SkillSearchResult {
    name: string;
    description: string;
    /** Relevance score: 0.0–1.0 (query token hit ratio). Always 1.0 from list(). */
    score: number;
    signature: {
        params: UasfParam[];
        returns: { type: string };
        effects: Effect[];
    };
    verified: boolean;
    wasmSize: number;
}

/**
 * In-memory store for UASF skill packages with keyword search and execution.
 *
 * Usage:
 *   const memory = new SkillMemory();
 *   memory.store(skill);
 *   const results = memory.search("fibonacci");
 *   const result = await memory.execute("FibSkill");
 */
export class SkillMemory {
    private readonly skills = new Map<string, SkillPackage>();

    /** Number of stored skills. */
    get size(): number {
        return this.skills.size;
    }

    /**
     * Store a skill package, keyed by metadata.name.
     * Overwrites if a skill with the same name already exists.
     * @throws if metadata.name is empty or missing
     */
    store(skill: SkillPackage): void {
        const name = skill?.metadata?.name;
        if (!name) {
            throw new Error(
                "Cannot store skill: metadata.name is empty or missing. " +
                "Provide a name via packageSkill({ metadata: { name: '...' } }).",
            );
        }
        this.skills.set(name, skill);
    }

    /** Retrieve a skill by exact name. Returns undefined if not found. */
    get(name: string): SkillPackage | undefined {
        return this.skills.get(name);
    }

    /**
     * Keyword search over name, description, and tags.
     * Returns matches ranked by relevance score (descending).
     * Empty query returns all skills (score 1.0).
     */
    search(query: string): SkillSearchResult[] {
        const tokens = tokenize(query);
        if (tokens.length === 0) {
            return this.list();
        }

        const results: SkillSearchResult[] = [];
        for (const skill of this.skills.values()) {
            const searchable = buildSearchableText(skill);
            let hits = 0;
            for (const token of tokens) {
                if (searchable.includes(token)) {
                    hits++;
                }
            }
            if (hits > 0) {
                results.push(toSearchResult(skill, hits / tokens.length));
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results;
    }

    /**
     * Execute a stored skill by name.
     * Returns structured result — never throws.
     */
    async execute(name: string, limits?: RunLimits): Promise<InvokeSkillResult> {
        const skill = this.skills.get(name);
        if (!skill) {
            return {
                ok: false,
                error: `Skill "${name}" not found in memory. ` +
                    `Available skills: [${[...this.skills.keys()].join(", ")}].`,
            };
        }
        return invokeSkill(skill, limits);
    }

    /**
     * Remove a skill from memory.
     * @returns true if the skill existed and was removed, false otherwise
     */
    remove(name: string): boolean {
        return this.skills.delete(name);
    }

    /** List all stored skills with metadata. Score is 1.0 for all. */
    list(): SkillSearchResult[] {
        return [...this.skills.values()].map((s) => toSearchResult(s, 1.0));
    }

    /** Serialize all stored packages for persistence. */
    toJSON(): SkillPackage[] {
        return [...this.skills.values()];
    }

    /** Reconstruct a SkillMemory from serialized data. */
    static fromJSON(data: SkillPackage[]): SkillMemory {
        const memory = new SkillMemory();
        for (const skill of data) {
            memory.store(skill);
        }
        return memory;
    }
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Tokenize a query string into lowercase words. */
function tokenize(query: string): string[] {
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
}

/** Build a searchable text string from a skill's metadata fields. */
function buildSearchableText(skill: SkillPackage): string {
    const parts = [
        skill.metadata.name,
        skill.metadata.description,
    ];
    if (skill.metadata.tags) {
        parts.push(...skill.metadata.tags);
    }
    return parts.join(" ").toLowerCase();
}

/** Convert a SkillPackage to a SkillSearchResult summary. */
function toSearchResult(skill: SkillPackage, score: number): SkillSearchResult {
    return {
        name: skill.metadata.name,
        description: skill.metadata.description,
        score,
        signature: {
            params: skill.interface?.params ?? [],
            returns: skill.interface?.returns ?? { type: "unknown" },
            effects: skill.interface?.effects ?? [],
        },
        verified: skill.verification?.verified ?? false,
        wasmSize: skill.binary?.wasmSize ?? 0,
    };
}
