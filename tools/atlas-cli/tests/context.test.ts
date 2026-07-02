import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context.js";
import type { LoadedIndex } from "../src/index-loader.js";
import type { Graph } from "../src/graph.js";

// Build a small synthetic index: A -se_apoya_en-> B -deriva_de-> C, and D -expresa-> A (extended).
function makeIndex(): LoadedIndex {
  const graph: Graph = {
    nodes: {
      ko_a: { id: "ko_a", type: "concept", title: "A", path: "a.md" },
      ko_b: { id: "ko_b", type: "concept", title: "B", path: "b.md" },
      ko_c: { id: "ko_c", type: "source", title: "C", path: "c.md" },
      ko_d: { id: "ko_d", type: "artifact", title: "D", path: "d.md" },
    },
    edges: {
      ko_a: [{ relation: "se_apoya_en", target_id: "ko_b", strength: "strong", kind: "core" }],
      ko_b: [{ relation: "deriva_de", target_id: "ko_c", strength: "strong", kind: "core" }],
      ko_d: [{ relation: "expresa", target_id: "ko_a", strength: "strong", kind: "extended" }],
    },
    reverse_edges: {
      ko_b: [{ relation: "se_apoya_en", source_id: "ko_a", strength: "strong", kind: "core" }],
      ko_c: [{ relation: "deriva_de", source_id: "ko_b", strength: "strong", kind: "core" }],
      ko_a: [{ relation: "expresa", source_id: "ko_d", strength: "strong", kind: "extended" }],
    },
  };
  return { objects: [], graph, relations: [], idPath: {} };
}

describe("Context Engine v0", () => {
  it("returns just the seed at hops=0-equivalent (1 hop, out) with direct neighbor", () => {
    const ctx = buildContext(makeIndex(), "ko_a", { hops: 1, direction: "out" });
    expect(ctx.nodes.find((n) => n.id === "ko_a")?.depth).toBe(0);
    expect(ctx.nodes.map((n) => n.id).sort()).toEqual(["ko_a", "ko_b"]);
  });

  it("traverses multiple hops outward", () => {
    const ctx = buildContext(makeIndex(), "ko_a", { hops: 2, direction: "out" });
    // a -> b -> c
    expect(ctx.nodes.map((n) => n.id).sort()).toEqual(["ko_a", "ko_b", "ko_c"]);
    expect(ctx.nodes.find((n) => n.id === "ko_c")?.depth).toBe(2);
  });

  it("respects the node budget and flags truncation", () => {
    const ctx = buildContext(makeIndex(), "ko_a", { hops: 5, budget: 2, direction: "both" });
    expect(ctx.nodes.length).toBeLessThanOrEqual(2);
    expect(ctx.truncated).toBe(true);
  });

  it("core-only skips extended edges", () => {
    // from ko_a both directions: incoming expresa (extended, from d) should be skipped
    const ctx = buildContext(makeIndex(), "ko_a", { hops: 1, direction: "both", coreOnly: true });
    expect(ctx.nodes.some((n) => n.id === "ko_d")).toBe(false);
    expect(ctx.nodes.some((n) => n.id === "ko_b")).toBe(true);
  });

  it("direction=in follows reverse edges", () => {
    const ctx = buildContext(makeIndex(), "ko_a", { hops: 1, direction: "in" });
    // only D expresa-> A, so reverse from A reaches D
    expect(ctx.nodes.map((n) => n.id).sort()).toEqual(["ko_a", "ko_d"]);
  });

  it("only keeps edges whose both endpoints are in the context", () => {
    const ctx = buildContext(makeIndex(), "ko_a", { hops: 1, budget: 2, direction: "out" });
    for (const e of ctx.edges) {
      expect(ctx.nodes.some((n) => n.id === e.source_id)).toBe(true);
      expect(ctx.nodes.some((n) => n.id === e.target_id)).toBe(true);
    }
  });

  it("returns empty for an unknown seed id", () => {
    const ctx = buildContext(makeIndex(), "ko_missing", {});
    expect(ctx.nodes).toHaveLength(0);
    expect(ctx.edges).toHaveLength(0);
  });

  it("is deterministic across runs", () => {
    const a = JSON.stringify(buildContext(makeIndex(), "ko_a", { hops: 2 }));
    const b = JSON.stringify(buildContext(makeIndex(), "ko_a", { hops: 2 }));
    expect(a).toBe(b);
  });
});

describe("Context Engine v0 — activation ranking", () => {
  it("keeps higher-activation neighbors under budget when activation is provided", () => {
    // seed S with three neighbors of different activation; budget lets in seed + 1 neighbor
    const graph = {
      nodes: {
        s: { id: "s", type: "concept", title: "S", path: "s.md" },
        low: { id: "low", type: "concept", title: "low", path: "low.md" },
        mid: { id: "mid", type: "concept", title: "mid", path: "mid.md" },
        high: { id: "high", type: "concept", title: "high", path: "high.md" },
      },
      edges: {
        s: [
          { relation: "trata_sobre", target_id: "low", strength: "strong" as const, kind: "core" as const },
          { relation: "trata_sobre", target_id: "mid", strength: "strong" as const, kind: "core" as const },
          { relation: "trata_sobre", target_id: "high", strength: "strong" as const, kind: "core" as const },
        ],
      },
      reverse_edges: {},
    };
    const idx = { objects: [], graph, relations: [], idPath: {} };
    const act = { low: 10, mid: 50, high: 90 };
    const ctx = buildContext(idx as any, "s", { hops: 1, budget: 2, direction: "out", activation: act });
    // budget 2 = seed + 1 neighbor; ranking must keep "high"
    expect(ctx.nodes.map((n) => n.id).sort()).toEqual(["high", "s"]);
    expect(ctx.truncated).toBe(true);
  });
});
