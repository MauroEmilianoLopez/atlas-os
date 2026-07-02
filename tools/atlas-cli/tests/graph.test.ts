import { describe, it, expect } from "vitest";
import { buildGraph, relationKind, type IndexedObject, type IndexedRelation } from "../src/graph.js";

const objects: IndexedObject[] = [
  { id: "ko_a", type: "concept", title: "A", lifecycle: "living", path: "a.md", created: "2026-01-01", tags: [], aliases: [] },
  { id: "ko_b", type: "concept", title: "B", lifecycle: "living", path: "b.md", created: "2026-01-01", tags: [], aliases: [] },
];

const relations: IndexedRelation[] = [
  { source_id: "ko_a", source_path: "a.md", relation: "se_apoya_en", target_id: "ko_b", strength: "strong", kind: "core" },
];

describe("graph", () => {
  it("classifies core vs extended relations", () => {
    expect(relationKind("se_apoya_en")).toBe("core");
    expect(relationKind("destila_a")).toBe("extended");
  });

  it("builds nodes, edges and reverse_edges for KO-to-KO relations", () => {
    const g = buildGraph(objects, relations);
    expect(Object.keys(g.nodes)).toHaveLength(2);
    expect(g.edges["ko_a"][0].target_id).toBe("ko_b");
    expect(g.reverse_edges["ko_b"][0].source_id).toBe("ko_a");
  });

  it("skips edges to unknown nodes (e.g. task targets)", () => {
    const g = buildGraph(objects, [
      { source_id: "ko_a", source_path: "a.md", relation: "produjo", target_id: "task_x", strength: "strong", kind: "extended" },
    ]);
    expect(g.edges["ko_a"]).toBeUndefined();
  });
});
