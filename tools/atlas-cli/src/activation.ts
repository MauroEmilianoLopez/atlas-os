import fs from "node:fs";
import path from "node:path";
import type { ActivationResult as CoreActivationResult, ActivationWeights as CoreActivationWeights, AtlasIndex, CoreResult, Relation } from "./core/contracts.js";
import { scoreActivation } from "./core/activation.js";
import { loadCoreIndex } from "./adapters/index-json.js";
import { SystemClock } from "./adapters/system-clock.js";
import { writeCache } from "./writer.js";
import type { ClockPort } from "./core/ports.js";

export type ActivationWeights = CoreActivationWeights;

export const DEFAULT_WEIGHTS: ActivationWeights = {
  humanEndorsement: 40,
  humanValidation: 15,
  centrality: 6,
  centralityCap: 5,
  hotThreshold: 50,
  reactivableFloor: 30,
};

export interface ActivationEntry {
  id: string;
  type: string;
  title: string;
  structural_score: number;
  band: "ACTIVO" | "REACTIVABLE" | "FRIO";
  signals: {
    human_endorsement: boolean;
    human_validation: boolean;
    strong_relations: number;
    active_intent_link: boolean;
    active_initiative_link: boolean;
    unresolved_contradiction: boolean;
  };
}

export interface ActivationCache {
  generated_at: string;
  component: "structural";
  weights: LegacyActivationWeights;
  entries: Record<string, ActivationEntry>;
  bands: { ACTIVO: number; REACTIVABLE: number; FRIO: number };
  note: string;
}

type ActivationWeightOverride = { -readonly [K in keyof ActivationWeights]?: ActivationWeights[K] };

interface LegacyActivationWeights {
  human_endorsement: number;
  human_validation: number;
  centrality: number;
  centrality_cap: number;
  active_intent_link: number;
  active_initiative_link: number;
  tension_bonus: number;
  hot_threshold: number;
  reactivable_floor: number;
}

const DEFAULT_LEGACY_WEIGHTS: LegacyActivationWeights = {
  human_endorsement: 40,
  human_validation: 15,
  centrality: 6,
  centrality_cap: 5,
  active_intent_link: 20,
  active_initiative_link: 12,
  tension_bonus: 10,
  hot_threshold: 50,
  reactivable_floor: 30,
};

const DEFAULT_LEGACY_NOTE =
  "Structural component only (v0). Volatile component (time decay, recent usage) not yet computed; requires Task runtime usage signals. No auto-compression is driven by this score (observation-only period, RFC-001.2).";

export function loadWeights(vaultRoot: string): ActivationWeights {
  const p = path.join(vaultRoot, ".atlas", "activation-weights.json");
  if (!fs.existsSync(p)) return DEFAULT_WEIGHTS;

  try {
    const override = normalizeWeightOverrides(JSON.parse(fs.readFileSync(p, "utf-8")));
    return override ? { ...DEFAULT_WEIGHTS, ...override } : DEFAULT_WEIGHTS;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export function runActivation(
  vaultRoot: string,
  options: { clock?: ClockPort } = {},
): CoreResult<ActivationCache> {
  const index = normalizeActivationIndex(loadCoreIndex(vaultRoot));
  const weights = loadWeights(vaultRoot);
  const clock = options.clock ?? new SystemClock();

  const scored = scoreActivation(index, weights, clock);
  if (!scored.ok) return scored;

  const cache = materializeActivationCache(index, scored.value, weights);
  persistActivation(vaultRoot, cache);
  return { ok: true, value: cache };
}

export function persistActivation(vaultRoot: string, result: ActivationCache): void {
  writeCache(vaultRoot, "activation.json", result);
}

function normalizeWeightOverrides(raw: unknown): ActivationWeightOverride | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  if (
    "humanEndorsement" in record ||
    "humanValidation" in record ||
    "centralityCap" in record ||
    "hotThreshold" in record ||
    "reactivableFloor" in record
  ) {
    return pickCoreWeights(record);
  }

  if (
    "human_endorsement" in record ||
    "human_validation" in record ||
    "centrality_cap" in record ||
    "hot_threshold" in record ||
    "reactivable_floor" in record
  ) {
    return pickLegacyWeights(record);
  }

  return null;
}

function pickCoreWeights(record: Record<string, unknown>): ActivationWeightOverride {
  const weights: ActivationWeightOverride = {};
  if (isFiniteNumber(record.humanEndorsement)) weights.humanEndorsement = record.humanEndorsement;
  if (isFiniteNumber(record.humanValidation)) weights.humanValidation = record.humanValidation;
  if (isFiniteNumber(record.centrality)) weights.centrality = record.centrality;
  if (isFiniteNumber(record.centralityCap)) weights.centralityCap = record.centralityCap;
  if (isFiniteNumber(record.hotThreshold)) weights.hotThreshold = record.hotThreshold;
  if (isFiniteNumber(record.reactivableFloor)) weights.reactivableFloor = record.reactivableFloor;
  return weights;
}

function pickLegacyWeights(record: Record<string, unknown>): ActivationWeightOverride {
  const weights: ActivationWeightOverride = {};
  if (isFiniteNumber(record.human_endorsement)) weights.humanEndorsement = record.human_endorsement;
  if (isFiniteNumber(record.human_validation)) weights.humanValidation = record.human_validation;
  if (isFiniteNumber(record.centrality)) weights.centrality = record.centrality;
  if (isFiniteNumber(record.centrality_cap)) weights.centralityCap = record.centrality_cap;
  if (isFiniteNumber(record.hot_threshold)) weights.hotThreshold = record.hot_threshold;
  if (isFiniteNumber(record.reactivable_floor)) weights.reactivableFloor = record.reactivable_floor;
  return weights;
}

function materializeActivationCache(
  index: AtlasIndex,
  scored: CoreActivationResult,
  weights: ActivationWeights,
): ActivationCache {
  const strongRelationCounts = relationDegrees(index);
  const activeAnchors = resolveActiveAnchors(index);
  const contradiction = contradictionSignals(index);

  const entries: Record<string, ActivationEntry> = {};
  const bands = { ACTIVO: 0, REACTIVABLE: 0, FRIO: 0 };

  for (const object of index.objects) {
    const important = readHumanFlag(object.attributes, "endorsedByHuman", "respaldado_por")
      || readHumanFlag(object.attributes, "validatedByHuman", "validado_por");
    const score = scored.scores[object.id] ?? 0;
    const band = scored.bands[object.id] ?? (score >= weights.hotThreshold ? "ACTIVO" : important ? "REACTIVABLE" : "FRIO");
    const entry: ActivationEntry = {
      id: object.id,
      type: object.type,
      title: object.title,
      structural_score: score,
      band,
      signals: {
        human_endorsement: readHumanFlag(object.attributes, "endorsedByHuman", "respaldado_por"),
        human_validation: readHumanFlag(object.attributes, "validatedByHuman", "validado_por"),
        strong_relations: strongRelationCounts.get(object.id) ?? 0,
        active_intent_link: activeAnchors.intents.has(object.id),
        active_initiative_link: activeAnchors.initiatives.has(object.id),
        unresolved_contradiction: contradiction.has(object.id),
      },
    };

    entries[object.id] = entry;
    bands[band]++;
  }

  return {
    generated_at: scored.generatedAt,
    component: "structural",
    weights: toLegacyWeights(weights),
    entries,
    bands,
    note: DEFAULT_LEGACY_NOTE,
  };
}

function normalizeActivationIndex(index: AtlasIndex): AtlasIndex {
  return {
    ...index,
    objects: index.objects.map((object) => ({
      ...object,
      attributes: {
        ...object.attributes,
        endorsedByHuman: readHumanFlag(object.attributes, "endorsedByHuman", "respaldado_por"),
        validatedByHuman: readHumanFlag(object.attributes, "validatedByHuman", "validado_por"),
      },
    })),
  };
}

function relationDegrees(index: AtlasIndex): ReadonlyMap<string, number> {
  const objectIds = new Set(index.objects.map((object) => object.id));
  const degrees = new Map<string, number>();
  const bump = (id: string) => degrees.set(id, (degrees.get(id) ?? 0) + 1);

  for (const relation of index.relations as readonly Relation[]) {
    if (objectIds.has(relation.sourceId)) bump(relation.sourceId);
    if (objectIds.has(relation.targetId)) bump(relation.targetId);
  }

  return degrees;
}

function resolveActiveAnchors(index: AtlasIndex): { intents: Set<string>; initiatives: Set<string> } {
  const intents = new Set<string>();
  const initiatives = new Set<string>();

  for (const object of index.objects) {
    if (object.lifecycle !== "living") continue;
    if (object.type === "intent") intents.add(object.id);
    if (object.type === "initiative") initiatives.add(object.id);
  }

  for (const relation of index.relations as readonly Relation[]) {
    if (intents.has(relation.targetId)) intents.add(relation.sourceId);
    if (intents.has(relation.sourceId)) intents.add(relation.targetId);
    if (initiatives.has(relation.targetId)) initiatives.add(relation.sourceId);
    if (initiatives.has(relation.sourceId)) initiatives.add(relation.targetId);
  }

  return { intents, initiatives };
}

function contradictionSignals(index: AtlasIndex): Set<string> {
  const contradiction = new Set<string>();
  const objectIds = new Set(index.objects.map((object) => object.id));

  for (const relation of index.relations as readonly Relation[]) {
    if (relation.kind !== "contradice") continue;
    contradiction.add(relation.sourceId);
    if (objectIds.has(relation.targetId)) contradiction.add(relation.targetId);
  }

  return contradiction;
}

function toLegacyWeights(weights: ActivationWeights): LegacyActivationWeights {
  return {
    human_endorsement: weights.humanEndorsement,
    human_validation: weights.humanValidation,
    centrality: weights.centrality,
    centrality_cap: weights.centralityCap,
    active_intent_link: DEFAULT_LEGACY_WEIGHTS.active_intent_link,
    active_initiative_link: DEFAULT_LEGACY_WEIGHTS.active_initiative_link,
    tension_bonus: DEFAULT_LEGACY_WEIGHTS.tension_bonus,
    hot_threshold: weights.hotThreshold,
    reactivable_floor: weights.reactivableFloor,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readHumanFlag(
  attributes: Readonly<Record<string, unknown>>,
  camelKey: string,
  legacyKey: string,
): boolean {
  return attributes[camelKey] === true || isHumanFlag(attributes[legacyKey]);
}

function isHumanFlag(value: unknown): boolean {
  if (value === "human") return true;
  return Array.isArray(value) && value.includes("human");
}
