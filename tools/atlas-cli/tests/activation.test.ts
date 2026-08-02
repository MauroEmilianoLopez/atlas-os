import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runActivation, loadWeights } from "../src/activation.js";
import { scoreActivation } from "../src/core/activation.js";
import { ExternalCapabilityError, InvalidArgumentError } from "../src/core/errors.js";
import type { ActivationWeights, AtlasIndex } from "../src/core/contracts.js";

function syntheticIndex(): AtlasIndex {
  return {
    objects: [
      {
        id: "ko_hot",
        type: "decision",
        title: "Hot",
        lifecycle: "living",
        created: "2026-01-01",
        attributes: { endorsedByHuman: true, validatedByHuman: true },
      },
      {
        id: "ko_reactivable",
        type: "concept",
        title: "Reactivable",
        lifecycle: "living",
        created: "2026-01-01",
        attributes: { validatedByHuman: true },
      },
      {
        id: "ko_cold",
        type: "concept",
        title: "Cold",
        lifecycle: "living",
        created: "2026-01-01",
        attributes: {},
      },
    ],
    relations: [{ sourceId: "ko_hot", kind: "supports", targetId: "ko_cold" }],
    graph: {
      nodes: { ko_hot: "ko_hot", ko_reactivable: "ko_reactivable", ko_cold: "ko_cold" },
      edges: { ko_hot: ["ko_cold"], ko_reactivable: [], ko_cold: [] },
      reverseEdges: { ko_hot: [], ko_reactivable: [], ko_cold: ["ko_hot"] },
    },
    tasks: [],
    stats: { objects: 3, relations: 1, tasks: 0, types: { decision: 1, concept: 2 } },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function writeCoreIndex(vaultRoot: string, index: AtlasIndex): void {
  const indexDir = join(vaultRoot, ".atlas", "index");
  mkdirSync(indexDir, { recursive: true });
  writeFileSync(join(indexDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function legacySensitiveIndex(): AtlasIndex {
  return {
    objects: [
      {
        id: "ko_intent",
        type: "intent",
        title: "Intent",
        lifecycle: "living",
        created: "2026-01-01",
        attributes: {},
      },
      {
        id: "ko_work",
        type: "initiative",
        title: "Work",
        lifecycle: "living",
        created: "2026-01-01",
        attributes: { endorsedByHuman: true },
      },
    ],
    relations: [{ sourceId: "ko_work", kind: "supports", targetId: "ko_intent" }],
    graph: {
      nodes: { ko_intent: "ko_intent", ko_work: "ko_work" },
      edges: { ko_intent: [], ko_work: ["ko_intent"] },
      reverseEdges: { ko_intent: ["ko_work"], ko_work: [] },
    },
    tasks: [],
    stats: { objects: 2, relations: 1, tasks: 0, types: { intent: 1, initiative: 1 } },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function contradictionSensitiveIndex(): AtlasIndex {
  return {
    objects: [
      {
        id: "ko_a",
        type: "concept",
        title: "A",
        lifecycle: "living",
        created: "2026-01-01",
        attributes: { endorsedByHuman: true },
      },
      {
        id: "ko_b",
        type: "concept",
        title: "B",
        lifecycle: "living",
        created: "2026-01-01",
        attributes: {},
      },
    ],
    relations: [{ sourceId: "ko_a", kind: "contradice", targetId: "ko_b" }],
    graph: {
      nodes: { ko_a: "ko_a", ko_b: "ko_b" },
      edges: { ko_a: ["ko_b"], ko_b: [] },
      reverseEdges: { ko_a: [], ko_b: ["ko_a"] },
    },
    tasks: [],
    stats: { objects: 2, relations: 1, tasks: 0, types: { concept: 2 } },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("scoreActivation", () => {
  const coreWeights: ActivationWeights = {
    humanEndorsement: 40,
    humanValidation: 15,
    centrality: 6,
    centralityCap: 5,
    hotThreshold: 50,
    reactivableFloor: 30,
  };

  const coreIndex = syntheticIndex();

  it("computes ACTIVO, REACTIVABLE, and FRIO from canonical Core data", () => {
    const result = scoreActivation(coreIndex, coreWeights, { now: () => "2026-02-03T04:05:06.000Z" });

    expect(result).toEqual({
      ok: true,
      value: {
        generatedAt: "2026-02-03T04:05:06.000Z",
        scores: {
          ko_hot: 61,
          ko_reactivable: 30,
          ko_cold: 6,
        },
        bands: {
          ko_hot: "ACTIVO",
          ko_reactivable: "REACTIVABLE",
          ko_cold: "FRIO",
        },
      },
    });
  });

  it("returns a typed invalid-argument result for invalid weights", () => {
    const result = scoreActivation(coreIndex, { ...coreWeights, centrality: -1 }, { now: () => "unused" });

    expect(result).toMatchObject({ ok: false, error: expect.any(InvalidArgumentError) });
    if (result.ok) throw new Error("Expected invalid weights to fail");
    expect(result.error).toMatchObject({ code: "INVALID_ARGUMENT", details: { argument: "centrality" } });
  });

  it("returns a typed external-capability result when the ClockPort fails", () => {
    const clockFailure = new Error("clock adapter failed");
    const result = scoreActivation(coreIndex, coreWeights, { now: () => { throw clockFailure; } });

    expect(result).toMatchObject({ ok: false, error: expect.any(ExternalCapabilityError) });
    if (result.ok) throw new Error("Expected clock failure to be returned");
    expect(result.error).toMatchObject({ code: "EXTERNAL_CAPABILITY", message: "Clock is unavailable" });
    expect(result.error.cause).toBe(clockFailure);
  });
});

describe("activation bridge", () => {
  let sandbox: string;
  let vault: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "atlas-activation-"));
    vault = join(sandbox, "vault");
    mkdirSync(join(vault, ".atlas"), { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("maps legacy snake_case activation weights into the Core contract", () => {
    writeFileSync(
      join(vault, ".atlas", "activation-weights.json"),
      JSON.stringify({ human_endorsement: 41 }, null, 2),
      "utf8",
    );

    expect(loadWeights(vault)).toEqual({
      humanEndorsement: 41,
      humanValidation: 15,
      centrality: 6,
      centralityCap: 5,
      hotThreshold: 50,
      reactivableFloor: 30,
    });
  });

  it("loads the Core index, uses the injected clock, and persists the legacy cache shape", () => {
    writeCoreIndex(vault, syntheticIndex());
    writeFileSync(
      join(vault, ".atlas", "activation-weights.json"),
      JSON.stringify({ human_endorsement: 41 }, null, 2),
      "utf8",
    );

    const result = runActivation(vault, { clock: { now: () => "2026-02-03T04:05:06.000Z" } });
    const cachePath = join(vault, ".atlas", "cache", "activation.json");
    const onDisk = readFileSync(cachePath, "utf8");

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw result.error;

    expect(result.value).toEqual(JSON.parse(onDisk));
    expect(result.value).toMatchObject({
      generated_at: "2026-02-03T04:05:06.000Z",
      component: "structural",
      weights: {
        human_endorsement: 41,
        human_validation: 15,
        centrality: 6,
        centrality_cap: 5,
        active_intent_link: 20,
        active_initiative_link: 12,
        tension_bonus: 10,
        hot_threshold: 50,
        reactivable_floor: 30,
      },
      bands: { ACTIVO: 1, REACTIVABLE: 1, FRIO: 1 },
      note: expect.stringContaining("Structural component only (v0)"),
    });
    expect(result.value.entries.ko_hot.band).toBe("ACTIVO");
    expect(result.value.entries.ko_reactivable.band).toBe("REACTIVABLE");
    expect(result.value.entries.ko_cold.band).toBe("FRIO");
    expect(result.value.entries.ko_hot.structural_score).toBe(62);
    expect(result.value.entries.ko_reactivable.structural_score).toBe(30);
    expect(result.value.entries.ko_cold.structural_score).toBe(6);
  });

  it("keeps activation canonical when intent links would have triggered a legacy bonus", () => {
    writeCoreIndex(vault, legacySensitiveIndex());

    const result = runActivation(vault, { clock: { now: () => "2026-02-03T04:05:06.000Z" } });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw result.error;

    expect(result.value.entries.ko_work.structural_score).toBe(46);
    expect(result.value.entries.ko_work.band).toBe("REACTIVABLE");
    expect(result.value.entries.ko_intent.structural_score).toBe(6);
    expect(result.value.entries.ko_intent.band).toBe("FRIO");
  });

  it("keeps contradiction signals canonical instead of reclustering them after the Core", () => {
    writeCoreIndex(vault, contradictionSensitiveIndex());

    const result = runActivation(vault, { clock: { now: () => "2026-02-03T04:05:06.000Z" } });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw result.error;

    expect(result.value.entries.ko_a.structural_score).toBe(46);
    expect(result.value.entries.ko_a.band).toBe("REACTIVABLE");
    expect(result.value.entries.ko_b.structural_score).toBe(6);
    expect(result.value.entries.ko_b.band).toBe("FRIO");
  });
});
