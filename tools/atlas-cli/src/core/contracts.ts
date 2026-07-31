import type { AtlasCoreError } from "./errors.js";

export type CoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AtlasCoreError };

export interface KnowledgeObject {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly lifecycle: "fleeting" | "living" | "archived";
  readonly created: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  /** Adapter-supplied location used only when rendering validation diagnostics. */
  readonly sourcePath?: string;
}

export interface Relation {
  readonly sourceId: string;
  readonly kind: string;
  readonly targetId: string;
  readonly label?: string;
  /** Adapter-supplied location used only when rendering validation diagnostics. */
  readonly sourcePath?: string;
}

export interface TaskRecord {
  readonly id: string;
  readonly status: string | null;
  readonly createdAt: string | null;
  /** Adapter-supplied location used only when rendering validation diagnostics. */
  readonly sourcePath?: string;
}

export interface KnowledgeSnapshot {
  readonly objects: readonly KnowledgeObject[];
  readonly relations: readonly Relation[];
  readonly tasks: readonly TaskRecord[];
  /** Diagnostics and counts that remain meaningful when source scanning can continue. */
  readonly validation?: ValidationSourceMetadata;
}

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly subject?: string;
  /** Adapter-supplied location used only when rendering validation diagnostics. */
  readonly sourcePath?: string;
}

export interface ValidationSourceMetadata {
  readonly filesScanned: number;
  readonly taskLogs: number;
  readonly diagnostics: readonly ValidationIssue[];
}

export interface ValidationRenderIssue {
  readonly level: "error" | "warning";
  readonly file: string;
  readonly message: string;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly filesScanned: number;
  readonly knowledgeObjects: number;
  readonly relationsChecked: number;
  readonly taskRefsChecked: number;
  readonly taskLogs: number;
  /** Render-ready errors for compatibility adapters. */
  readonly errors: readonly ValidationRenderIssue[];
  /** Render-ready warnings for compatibility adapters. */
  readonly warnings: readonly ValidationRenderIssue[];
  readonly issues: readonly ValidationIssue[];
}

export interface AtlasIndex {
  readonly objects: readonly KnowledgeObject[];
  readonly relations: readonly Relation[];
  readonly graph: AtlasGraph;
  readonly tasks: readonly TaskRecord[];
  readonly stats: AtlasIndexStats;
  readonly generatedAt: string;
}

export interface AtlasGraph {
  readonly nodes: Readonly<Record<string, string>>;
  readonly edges: Readonly<Record<string, readonly string[]>>;
  readonly reverseEdges: Readonly<Record<string, readonly string[]>>;
}

export interface AtlasIndexStats {
  readonly objects: number;
  readonly relations: number;
  readonly tasks: number;
  readonly types: Readonly<Record<string, number>>;
}

export interface ContextQuery {
  readonly seedId: string;
  readonly hops?: number;
  readonly budget?: number;
  readonly direction?: "out" | "in" | "both";
}

export interface ContextResult {
  readonly seedId: string;
  readonly nodes: readonly KnowledgeObject[];
  readonly relations: readonly Relation[];
  readonly truncated: boolean;
}

export interface ActivationWeights {
  readonly humanEndorsement: number;
  readonly humanValidation: number;
  readonly centrality: number;
  readonly centralityCap: number;
  readonly hotThreshold: number;
  readonly reactivableFloor: number;
}

export type ActivationBand = "ACTIVO" | "REACTIVABLE" | "FRIO";

export interface ActivationResult {
  readonly generatedAt: string;
  readonly scores: Readonly<Record<string, number>>;
  readonly bands: Readonly<Record<string, ActivationBand>>;
}
