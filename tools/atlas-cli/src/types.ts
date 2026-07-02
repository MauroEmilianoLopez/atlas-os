// types.ts — Atlas domain constants and TypeScript types (P1).
// Mirrors RFC-001.x domain + RFC-002 physical representation. Source of truth for the validator.

export const KO_TYPES = [
  "signal",
  "initiative",
  "event",
  "decision",
  "source",
  "excerpt",
  "artifact",
  "actor",
  "technology",
  "concept",
  "insight",
  "intent",
  "prompt",
  "agent",
  "policy",
] as const;
export type KOType = (typeof KO_TYPES)[number];

export const LIFECYCLE = ["fleeting", "living", "archived"] as const;
export type Lifecycle = (typeof LIFECYCLE)[number];

// ID prefix per type (RFC-002 / P0 decision). Most KOs share ko_; agents/tasks/policies differ.
export const ID_PREFIX: Record<string, string> = {
  signal: "ko_",
  initiative: "ko_",
  event: "ko_",
  decision: "ko_",
  source: "ko_",
  excerpt: "ko_",
  artifact: "ko_",
  actor: "ko_",
  technology: "ko_",
  concept: "ko_",
  insight: "ko_",
  intent: "ko_",
  prompt: "ko_",
  agent: "agent_",
  task: "task_",
  policy: "policy_",
};

export const ALL_PREFIXES = ["ko_", "agent_", "task_", "policy_"] as const;

// Core relations (8) — daily use (RFC-001.1 §3.2).
export const CORE_RELATIONS = [
  "deriva_de",
  "se_apoya_en",
  "contradice",
  "trata_sobre",
  "decide_sobre",
  "avanza",
  "escrito_por",
  "respaldado_por",
] as const;

// Extended relations — used only when needed (RFC-001.1 §3.3).
export const EXTENDED_RELATIONS = [
  "generaliza",
  "es_caso_de",
  "compone",
  "es_parte_de",
  "agrupa",
  "pertenece_a",
  "refina",
  "ejemplifica",
  "superado_por",
  "atribuido_a",
  "validado_por",
  "destila_a",
  "usa",
  "aplica",
  "produce",
  "expresa",
  "precede",
  "causa",
  "ejecutado_por",
  "requiere_contexto",
  "produjo",
  "corrige",
  "gobierna",
  // Inverse / passive forms that appear in the vocabulary and example KOs.
  "producido_por",
  "gobernado_por",
] as const;

export const ALL_RELATIONS = [...CORE_RELATIONS, ...EXTENDED_RELATIONS];

// Relations whose value is a scalar id reference rather than an array of objects.
// escrito_por / respaldado_por point to a single actor/agent ("human" is also allowed).
export const SCALAR_RELATIONS = new Set<string>(["escrito_por", "respaldado_por", "validado_por"]);

// Folder mapping for `atlas new` (type -> relative path under vault root).
export const TYPE_FOLDER: Record<string, string> = {
  concept: "knowledge/concepts",
  insight: "knowledge/insights",
  intent: "knowledge/intents",
  prompt: "knowledge/prompts",
  initiative: "work/initiatives",
  event: "work/events",
  decision: "work/decisions",
  source: "work/sources",
  artifact: "work/artifacts",
  actor: "world/actors",
  technology: "world/technologies",
  agent: "execution/agents",
  policy: "execution/policies",
};

export interface RelationTarget {
  target_id: string;
  label?: string;
  deriva_de?: string[];
  escrito_por?: string;
  respaldado_por?: string;
  validado_por?: string;
}

export interface KnowledgeObject {
  id: string;
  type: KOType;
  title: string;
  lifecycle: Lifecycle;
  created: string;
  derived: { managed_by: string; cached: boolean };
  [key: string]: unknown;
}

export interface ParsedFile {
  path: string;
  relPath: string;
  hasFrontmatter: boolean;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface Issue {
  level: "error" | "warning";
  file: string;
  message: string;
}
