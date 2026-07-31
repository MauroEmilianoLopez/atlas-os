import type { ActivationBand, ActivationResult, ActivationWeights, AtlasIndex, CoreResult } from "./contracts.js";
import { ExternalCapabilityError, InvalidArgumentError } from "./errors.js";
import type { ClockPort } from "./ports.js";

const WEIGHT_NAMES: readonly (keyof ActivationWeights)[] = [
  "humanEndorsement",
  "humanValidation",
  "centrality",
  "centralityCap",
  "hotThreshold",
  "reactivableFloor",
];

export function scoreActivation(
  index: AtlasIndex,
  weights: ActivationWeights,
  clock: ClockPort,
): CoreResult<ActivationResult> {
  const weightsResult = validateWeights(weights);
  if (!weightsResult.ok) return weightsResult;

  const generatedAtResult = readClock(clock);
  if (!generatedAtResult.ok) return generatedAtResult;

  const degrees = relationDegrees(index);
  const scores: Record<string, number> = {};
  const bands: Record<string, ActivationBand> = {};

  for (const object of index.objects) {
    const endorsed = object.attributes.endorsedByHuman === true;
    const validated = object.attributes.validatedByHuman === true;
    const important = endorsed || validated;
    const degree = Math.min(degrees.get(object.id) ?? 0, weights.centralityCap);
    const raw = (endorsed ? weights.humanEndorsement : 0)
      + (validated ? weights.humanValidation : 0)
      + degree * weights.centrality;
    const score = Math.round(Math.max(0, Math.min(100, important ? Math.max(raw, weights.reactivableFloor) : raw)));

    scores[object.id] = score;
    bands[object.id] = score >= weights.hotThreshold ? "ACTIVO" : important ? "REACTIVABLE" : "FRIO";
  }

  return { ok: true, value: { generatedAt: generatedAtResult.value, scores, bands } };
}

function validateWeights(weights: ActivationWeights): CoreResult<ActivationWeights> {
  for (const name of WEIGHT_NAMES) {
    const value = weights[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: new InvalidArgumentError(name, `${name} must be a non-negative finite number`) };
    }
  }

  if (!Number.isInteger(weights.centralityCap)) {
    return { ok: false, error: new InvalidArgumentError("centralityCap", "centralityCap must be a non-negative integer") };
  }
  if (weights.hotThreshold > 100) {
    return { ok: false, error: new InvalidArgumentError("hotThreshold", "hotThreshold must not exceed 100") };
  }
  if (weights.reactivableFloor > 100) {
    return { ok: false, error: new InvalidArgumentError("reactivableFloor", "reactivableFloor must not exceed 100") };
  }

  return { ok: true, value: weights };
}

function readClock(clock: ClockPort): CoreResult<string> {
  try {
    return { ok: true, value: clock.now() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ExternalCapabilityError
        ? error
        : new ExternalCapabilityError("Clock is unavailable", error),
    };
  }
}

function relationDegrees(index: AtlasIndex): ReadonlyMap<string, number> {
  const objectIds = new Set(index.objects.map((object) => object.id));
  const degrees = new Map<string, number>();
  const increment = (id: string) => degrees.set(id, (degrees.get(id) ?? 0) + 1);

  for (const relation of index.relations) {
    if (objectIds.has(relation.sourceId)) increment(relation.sourceId);
    if (objectIds.has(relation.targetId)) increment(relation.targetId);
  }

  return degrees;
}
