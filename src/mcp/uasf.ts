// =============================================================================
// Universal Agent Skill Format (UASF) Types
// =============================================================================
// An open standard for packaging agent capabilities as verified, portable WASM modules.

import type { Effect, Expression } from "../ast/nodes.js";

export interface UasfMetadata {
    name: string;
    version: string;
    description: string;
    author: string;
    license?: string;
    tags?: string[];
    createdAt?: string;
}

export interface UasfBinary {
    wasm: string; // base64 encoded
    wasmSize: number;
    checksum: string; // e.g. "sha256:abc..."
}

export interface UasfParam {
    name: string;
    type: string;
    description?: string;
}

export interface UasfInterface {
    entryPoint: string;
    params: UasfParam[];
    returns: { type: string; description?: string };
    effects: Effect[];
}

export interface UasfContract {
    kind: "pre" | "post";
    condition: Expression; // The AST JSON for the contract condition
    natural?: string;
}

export interface UasfVerification {
    verified: boolean;
    contracts: UasfContract[];
    provenBy?: string;
}

export interface UasfCapabilities {
    required: string[];
    optional: string[];
}

export interface UasfPackage {
    uasf: string; // "1.0"
    metadata: UasfMetadata;
    binary: UasfBinary;
    interface: UasfInterface;
    verification: UasfVerification;
    capabilities: UasfCapabilities;
}
