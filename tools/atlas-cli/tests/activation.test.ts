import { describe, it, expect } from "vitest";
import { computeActivation, DEFAULT_WEIGHTS } from "../src/activation.js";
import { scoreActivation } from "../src/core/activation.js";
import { ExternalCapabilityError, InvalidArgumentError } from "../src/core/errors.js";
import type { ActivationWeights, AtlasIndex } from "../src/core/contracts.js";
import type { LoadedIndex } from "../src/index-loader.js";
import type { Graph, IndexedObject, IndexedRelation } from "../src/graph.js";

function idx(objects: IndexedObject[], relations: IndexedRelation[]): LoadedIndex {
  const nodes: Graph["nodes"] = {};
  for (const o of objects) nodes[o.id] = { id: o.id, type: o.type, title: o.title, path: o.path };
  const edges: Graph["edges"] = {};
  const reverse_edges: Graph["reverse_edges"] = {};
  for (const r of relations) {
    (edges[r.source_id] ??= []).push({ relation: r.relation, target_id: r.target_id, strength: "strong", kind: r.kind });
    if (nodes[r.target_id]) (reverse_edges[r.target_id] ??= []).push({ relation: r.relation, source_id: r.source_id, strength: "strong", kind: r.kind });
  }
  return { objects, relations, graph: { nodes, edges, reverse_edges }, idPath: {} };
}
function obj(id: string, type: string, extra: Partial<IndexedObject> = {}): IndexedObject {
  return { id, type, title: id, lifecycle: "living", path: `${id}.md`, created: "2026-01-01", tags: [], aliases: [], ...extra };
}

describe("Activation v0 (structural)", () => {
  it("reports it computes only the structural component", () => {
    const r = computeActivation(idx([obj("ko_a", "concept")], []));
    expect(r.component).toBe("structural");
  });

  it("human endorsement dominates the score", () => {
    const r = computeActivation(idx([
      obj("ko_endorsed", "concept", { endorsed_by_human: true }),
      obj("ko_plain", "concept"),
    ], []));
    expect(r.entries["ko_endorsed"].structural_score).toBeGreaterThan(r.entries["ko_plain"].structural_score);
    expect(r.entries["ko_endorsed"].structural_score).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.human_endorsement);
  });

  it("applies the importance floor: endorsed KOs never fall below reactivable_floor", () => {
    // an endorsed KO with no other signal should be floored to reactivable_floor, band REACTIVABLE
    const r = computeActivation(idx([obj("ko_x", "actor", { endorsed_by_human: true })], []));
    expect(r.entries["ko_x"].structural_score).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.reactivable_floor);
  });

  it("caps centrality (anti-popularity)", () => {
    // one node with many strong relations should not exceed cap * centrality contribution
    const rels: IndexedRelation[] = [];
    const objs = [obj("ko_hub", "concept")];
    for (let i = 0; i < 20; i++) {
      objs.push(obj(`ko_${i}`, "concept"));
      rels.push({ source_id: "ko_hub", source_path: "ko_hub.md", relation: "trata_sobre", target_id: `ko_${i}`, strength: "strong", kind: "core" });
    }
    const r = computeActivation(idx(objs, rels));
    // hub's centrality contribution is capped; total must be <= cap*w + any other (none here)
    expect(r.entries["ko_hub"].structural_score).toBeLessThanOrEqual(DEFAULT_WEIGHTS.centrality * DEFAULT_WEIGHTS.centrality_cap);
  });

  it("gives a tension bonus for unresolved contradictions", () => {
    const withT = computeActivation(idx([
      obj("ko_a", "concept"), obj("ko_b", "concept"),
    ], [{ source_id: "ko_a", source_path: "a.md", relation: "contradice", target_id: "ko_b", strength: "strong", kind: "core" }]));
    expect(withT.entries["ko_a"].signals.unresolved_contradiction).toBe(true);
    expect(withT.entries["ko_b"].signals.unresolved_contradiction).toBe(true);
  });

  it("links to an active intent raise activation", () => {
    const r = computeActivation(idx([
      obj("ko_i", "intent", { lifecycle: "living" }),
      obj("ko_work", "initiative"),
    ], [{ source_id: "ko_work", source_path: "w.md", relation: "avanza", target_id: "ko_i", strength: "strong", kind: "core" }]));
    expect(r.entries["ko_work"].signals.active_intent_link).toBe(true);
  });

  it("assigns bands and counts them", () => {
    const r = computeActivation(idx([
      obj("ko_hot", "decision", { endorsed_by_human: true, validated_by_human: true }),
      obj("ko_cold", "technology"),
    ], []));
    expect(["ACTIVO", "REACTIVABLE", "FRIO"]).toContain(r.entries["ko_hot"].band);
    expect(r.bands.ACTIVO + r.bands.REACTIVABLE + r.bands.FRIO).toBe(2);
  });

  it("is deterministic", () => {
    const build = () => JSON.stringify(computeActivation(idx([obj("ko_a", "concept", { endorsed_by_human: true })], [])).entries);
    expect(build()).toBe(build());
  });
});

const coreWeights: ActivationWeights = {
  humanEndorsement: 40,
  humanValidation: 15,
  centrality: 6,
  centralityCap: 5,
  hotThreshold: 50,
  reactivableFloor: 30,
};

function coreIndex(): AtlasIndex {
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

describe("scoreActivation", () => {
  it("computes structural scores and bands from canonical index data", () => {
    const result = scoreActivation(coreIndex(), coreWeights, { now: () => "2026-02-03T04:05:06.000Z" });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw result.error;

    expect(result.value).toEqual({
      generatedAt: "2026-02-03T04:05:06.000Z",
      scores: { ko_hot: 61, ko_reactivable: 30, ko_cold: 6 },
      bands: { ko_hot: "ACTIVO", ko_reactivable: "REACTIVABLE", ko_cold: "FRIO" },
    });
  });

  it("returns a typed invalid-argument result for invalid weights", () => {
    const result = scoreActivation(coreIndex(), { ...coreWeights, centrality: -1 }, { now: () => "unused" });

    expect(result).toMatchObject({ ok: false, error: expect.any(InvalidArgumentError) });
    if (result.ok) throw new Error("Expected invalid weights to fail");
    expect(result.error).toMatchObject({ code: "INVALID_ARGUMENT", details: { argument: "centrality" } });
  });

  it("returns a typed external-capability result when the ClockPort fails", () => {
    const clockFailure = new Error("clock adapter failed");
    const result = scoreActivation(coreIndex(), coreWeights, { now: () => { throw clockFailure; } });

    expect(result).toMatchObject({ ok: false, error: expect.any(ExternalCapabilityError) });
    if (result.ok) throw new Error("Expected clock failure to be returned");
    expect(result.error).toMatchObject({ code: "EXTERNAL_CAPABILITY", message: "Clock is unavailable" });
    expect(result.error.cause).toBe(clockFailure);
  });
});
