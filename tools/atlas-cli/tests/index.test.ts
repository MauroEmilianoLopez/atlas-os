import { describe, expect, it } from "vitest";
import { buildKnowledgeIndex } from "../src/core/index.js";
import { SourceUnavailableError, ValidationFailedError } from "../src/core/errors.js";
import type { KnowledgeSourcePort } from "../src/core/ports.js";

const clock = { now: () => "2026-02-03T04:05:06.000Z" };

describe("buildKnowledgeIndex", () => {
  it("validates then derives objects, relations, graph, tasks, and stats from an in-memory source", () => {
    const source: KnowledgeSourcePort = {
      load: () => ({
        objects: [
          {
            id: "ko_alpha",
            type: "concept",
            title: "Alpha",
            lifecycle: "living",
            created: "2026-01-01",
            attributes: {},
          },
          {
            id: "ko_beta",
            type: "concept",
            title: "Beta",
            lifecycle: "living",
            created: "2026-01-02",
            attributes: {},
          },
        ],
        relations: [{ sourceId: "ko_alpha", kind: "supports", targetId: "ko_beta" }],
        tasks: [{ id: "task_review", status: "open", createdAt: "2026-01-03" }],
      }),
    };

    const result = buildKnowledgeIndex(source, clock);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw result.error;

    expect(result.value.objects.map((object) => object.id)).toEqual(["ko_alpha", "ko_beta"]);
    expect(result.value.relations).toEqual([{ sourceId: "ko_alpha", kind: "supports", targetId: "ko_beta" }]);
    expect(result.value.tasks).toEqual([{ id: "task_review", status: "open", createdAt: "2026-01-03" }]);
    expect(result.value.generatedAt).toBe("2026-02-03T04:05:06.000Z");
    expect(result.value.graph.nodes).toEqual({ ko_alpha: "ko_alpha", ko_beta: "ko_beta" });
    expect(result.value.graph.edges).toEqual({ ko_alpha: ["ko_beta"], ko_beta: [] });
    expect(result.value.graph.reverseEdges).toEqual({ ko_alpha: [], ko_beta: ["ko_alpha"] });
    expect(result.value.stats).toEqual({ objects: 2, relations: 1, tasks: 1, types: { concept: 2 } });
  });

  it("returns a typed validation failure instead of deriving a partial index", () => {
    const source: KnowledgeSourcePort = {
      load: () => ({
        objects: [
          {
            id: "ko_alpha",
            type: "concept",
            title: "Alpha",
            lifecycle: "living",
            created: "2026-01-01",
            attributes: {},
          },
        ],
        relations: [{ sourceId: "ko_alpha", kind: "supports", targetId: "ko_missing" }],
        tasks: [],
      }),
    };

    const result = buildKnowledgeIndex(source, clock);

    expect(result).toMatchObject({ ok: false, error: expect.any(ValidationFailedError) });
    if (result.ok) throw new Error("Expected a validation failure");
    expect(result.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns typed source failures without leaking an exception", () => {
    const unavailable = new SourceUnavailableError("Knowledge source is unavailable");
    const source: KnowledgeSourcePort = { load: () => { throw unavailable; } };

    const result = buildKnowledgeIndex(source, clock);

    expect(result).toEqual({ ok: false, error: unavailable });
  });
});
