// activation.ts — Activation Model v0: STRUCTURAL component only (RFC-001.2).
//
// Activation = volatile (decays with time) + structural (does not decay by clock).
// P4 computes ONLY the structural component, because the volatile one needs real usage signals
// (recent access, task usage, edits) that don't exist yet — there is no Task runtime recording
// them. Inventing recency would be false precision. So v0 is honest: structural only.
//
// Structural signals, all readable from the P2 index today (RFC-001.2 §3.2):
//   - human endorsement (respaldado_por: human)   -> the strongest, most durable signal
//   - human validation  (validado_por: human)
//   - strong-relation centrality (capped, anti-popularity)
//   - link to an active Intent / active Initiative (via graph reachability)
//   - unresolved contradictions (contradice)       -> tension bonus (anti confirmation bias)
//   - importance floor: nothing structurally important is ever buried
//
// NOT in v0: volatile component, time decay, auto-compression/archiving (RFC-001.2 recommends an
// "observation-only" period first). Weights live as DATA (recalibrable) per RFC-001.2 §5.3.

import type { LoadedIndex } from "./index-loader.js";
import type { IndexedObject, IndexedRelation } from "./graph.js";
import { writeCache } from "./writer.js";

export interface ActivationWeights {
  human_endorsement: number;   // respaldado_por: human
  human_validation: number;    // validado_por: human
  centrality: number;          // per strong relation, up to centrality_cap
  centrality_cap: number;      // max number of relations that count (anti-popularity)
  active_intent_link: number;  // reachable to/from an active Intent
  active_initiative_link: number;
  tension_bonus: number;       // has an unresolved `contradice`
  // Bands (thresholds on the normalized 0..100 score).
  hot_threshold: number;       // >= => ACTIVO
  reactivable_floor: number;   // importance floor: structurally important never below this
}

// Sane starting defaults. Human endorsement dominates (RFC-001.2 §5.3). These are DATA:
// overridable via .atlas/activation-weights.json without touching code.
export const DEFAULT_WEIGHTS: ActivationWeights = {
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

export type Band = "ACTIVO" | "REACTIVABLE" | "FRIO";

export interface ActivationEntry {
  id: string;
  type: string;
  title: string;
  structural_score: number;   // 0..100 (volatile omitted in v0)
  band: Band;
  signals: {
    human_endorsement: boolean;
    human_validation: boolean;
    strong_relations: number;
    active_intent_link: boolean;
    active_initiative_link: boolean;
    unresolved_contradiction: boolean;
  };
}

export interface ActivationResult {
  generated_at: string;
  component: "structural";     // explicit: v0 has no volatile
  weights: ActivationWeights;
  entries: Record<string, ActivationEntry>;  // by id
  bands: { ACTIVO: number; REACTIVABLE: number; FRIO: number };
  note: string;
}

function isHuman(v: unknown): boolean {
  return v === "human";
}

/** Collect ids of KOs that are "active": Intents/Initiatives whose lifecycle is living. */
function activeAnchors(objects: IndexedObject[]): { intents: Set<string>; initiatives: Set<string> } {
  const intents = new Set<string>();
  const initiatives = new Set<string>();
  for (const o of objects) {
    if (o.lifecycle !== "living") continue;
    if (o.type === "intent") intents.add(o.id);
    if (o.type === "initiative") initiatives.add(o.id);
  }
  return { intents, initiatives };
}

/** Compute the structural activation for every KO in the index. Pure function. */
export function computeActivation(
  idx: LoadedIndex,
  weights: ActivationWeights = DEFAULT_WEIGHTS,
): ActivationResult {
  const { objects, relations, graph } = idx;
  const { intents, initiatives } = activeAnchors(objects);

  // Precompute per-node: endorsement, validation, contradiction, strong-relation degree,
  // and whether it links (either direction) to an active Intent/Initiative.
  const endorsed = new Set<string>();
  const validated = new Set<string>();
  const hasContradiction = new Set<string>();
  const degree = new Map<string, number>();
  const linkedIntent = new Set<string>();
  const linkedInitiative = new Set<string>();

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const r of relations as IndexedRelation[]) {
    // degree: count strong relations touching either endpoint
    bump(degree, r.source_id);
    if (graph.nodes[r.target_id]) bump(degree, r.target_id);

    if (r.relation === "respaldado_por" && isHuman(r.target_id)) endorsed.add(r.source_id);
    if (r.relation === "validado_por" && isHuman(r.target_id)) validated.add(r.source_id);
    if (r.relation === "contradice") {
      hasContradiction.add(r.source_id);
      if (graph.nodes[r.target_id]) hasContradiction.add(r.target_id);
    }
    // active anchor links (either direction)
    if (intents.has(r.target_id)) linkedIntent.add(r.source_id);
    if (intents.has(r.source_id)) linkedIntent.add(r.target_id);
    if (initiatives.has(r.target_id)) linkedInitiative.add(r.source_id);
    if (initiatives.has(r.source_id)) linkedInitiative.add(r.target_id);
  }

  const entries: Record<string, ActivationEntry> = {};
  const bands = { ACTIVO: 0, REACTIVABLE: 0, FRIO: 0 };

  for (const o of objects) {
    const eEndorsed = endorsed.has(o.id) || o.endorsed_by_human === true;
    const eValidated = validated.has(o.id) || o.validated_by_human === true;
    const deg = degree.get(o.id) ?? 0;
    const cappedDeg = Math.min(deg, weights.centrality_cap);
    const eIntent = linkedIntent.has(o.id) || o.type === "intent" && o.lifecycle === "living";
    const eInitiative = linkedInitiative.has(o.id);
    const eTension = hasContradiction.has(o.id);

    let raw =
      (eEndorsed ? weights.human_endorsement : 0) +
      (eValidated ? weights.human_validation : 0) +
      cappedDeg * weights.centrality +
      (eIntent ? weights.active_intent_link : 0) +
      (eInitiative ? weights.active_initiative_link : 0) +
      (eTension ? weights.tension_bonus : 0);

    // normalize to 0..100 (clamp)
    let score = Math.max(0, Math.min(100, raw));

    // importance floor: an endorsed/validated KO is structurally important and must never be buried
    const important = eEndorsed || eValidated;
    if (important && score < weights.reactivable_floor) {
      score = weights.reactivable_floor;
    }

    const band: Band =
      score >= weights.hot_threshold
        ? "ACTIVO"
        : important
          ? "REACTIVABLE"
          : "FRIO";

    bands[band]++;

    entries[o.id] = {
      id: o.id,
      type: o.type,
      title: o.title,
      structural_score: Math.round(score),
      band,
      signals: {
        human_endorsement: eEndorsed,
        human_validation: eValidated,
        strong_relations: deg,
        active_intent_link: eIntent,
        active_initiative_link: eInitiative,
        unresolved_contradiction: eTension,
      },
    };
  }

  return {
    generated_at: new Date().toISOString(),
    component: "structural",
    weights,
    entries,
    bands,
    note: "Structural component only (v0). Volatile component (time decay, recent usage) not yet computed; requires Task runtime usage signals. No auto-compression is driven by this score (observation-only period, RFC-001.2).",
  };
}

// Note: human endorsement/validation are recovered by the P2 indexer as boolean flags on each
// IndexedObject (endorsed_by_human / validated_by_human), because a relation cannot point at a
// non-node "human" without breaking graph integrity. Activation reads those flags directly.

import fs from "node:fs";
import path from "node:path";

/** Load weights from .atlas/activation-weights.json if present, else defaults (RFC-001.2 §5.3: weights are data). */
export function loadWeights(vaultRoot: string): ActivationWeights {
  const p = path.join(vaultRoot, ".atlas", "activation-weights.json");
  if (fs.existsSync(p)) {
    try {
      const override = JSON.parse(fs.readFileSync(p, "utf-8"));
      return { ...DEFAULT_WEIGHTS, ...override };
    } catch {
      // fall through to defaults on malformed config
    }
  }
  return DEFAULT_WEIGHTS;
}

/** Compute and persist activation to .atlas/cache/activation.json. */
export function persistActivation(vaultRoot: string, result: ActivationResult): void {
  writeCache(vaultRoot, "activation.json", result);
}
