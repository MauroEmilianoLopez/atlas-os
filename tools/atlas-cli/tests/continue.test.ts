import { describe, expect, it } from "vitest";
import { compareContinuePriority } from "../src/continue.js";

describe("continue priority ordering", () => {
  it("keeps score ties stable by depth, title, then id", () => {
    const nodes = [
      { id: "node-c", title: "Alpha", type: "decision", depth: 2, score: 50 },
      { id: "node-b", title: "Alpha", type: "decision", depth: 1, score: 50 },
      { id: "node-a", title: "Alpha", type: "decision", depth: 1, score: 50 },
      { id: "node-d", title: "Beta", type: "decision", depth: 1, score: 50 },
    ];

    expect([...nodes].sort(compareContinuePriority).map((node) => node.id)).toEqual([
      "node-a",
      "node-b",
      "node-d",
      "node-c",
    ]);
  });
});
