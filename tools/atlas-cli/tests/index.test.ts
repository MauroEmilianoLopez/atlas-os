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

  it("preserves relation traversal kinds for later core-only context assembly", () => {
    const source: KnowledgeSourcePort = {
      load: () => ({
        objects: [
          { id: "ko_alpha", type: "concept", title: "Alpha", lifecycle: "living", created: "2026-01-01", attributes: {} },
          { id: "ko_beta", type: "concept", title: "Beta", lifecycle: "living", created: "2026-01-02", attributes: {} },
          { id: "ko_gamma", type: "concept", title: "Gamma", lifecycle: "living", created: "2026-01-03", attributes: {} },
        ],
        relations: [
          { sourceId: "ko_alpha", kind: "supports", targetId: "ko_beta", traversalKind: "core" },
          { sourceId: "ko_alpha", kind: "mentions", targetId: "ko_gamma", traversalKind: "extended" },
        ],
        tasks: [],
      }),
    };

    const result = buildKnowledgeIndex(source, clock);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw result.error;
    expect(result.value.relations).toEqual([
      { sourceId: "ko_alpha", kind: "supports", targetId: "ko_beta", traversalKind: "core" },
      { sourceId: "ko_alpha", kind: "mentions", targetId: "ko_gamma", traversalKind: "extended" },
    ]);
  });

  it("preserves the complete structured relation data needed for legacy relations.json", () => {
    const source: KnowledgeSourcePort = {
      load: () => ({
        objects: [
          { id: "ko_alpha", type: "concept", title: "Alpha", lifecycle: "living", created: "2026-01-01", attributes: {} },
          { id: "ko_beta", type: "concept", title: "Beta", lifecycle: "living", created: "2026-01-02", attributes: {} },
          { id: "agent_editor", type: "agent", title: "Editor", lifecycle: "living", created: "2026-01-03", attributes: {} },
          { id: "agent_reviewer", type: "agent", title: "Reviewer", lifecycle: "living", created: "2026-01-04", attributes: {} },
          { id: "agent_validator", type: "agent", title: "Validator", lifecycle: "living", created: "2026-01-05", attributes: {} },
        ],
        relations: [
          {
            sourceId: "ko_alpha",
            kind: "se_apoya_en",
            targetId: "ko_beta",
            label: "Beta evidence",
            traversalKind: "core",
            sourcePath: "knowledge/concepts/alpha.md",
            derivesFrom: ["ko_evidence"],
            writtenBy: "agent_editor",
            endorsedBy: "agent_reviewer",
            validatedBy: "agent_validator",
          },
          {
            sourceId: "ko_alpha",
            originalSourceId: "map_research",
            kind: "trata_sobre",
            targetId: "ko_beta",
            originalTargetId: "legacy_beta_reference",
            traversalKind: "core",
            sourcePath: "maps/research.md",
          },
          { sourceId: "ko_alpha", kind: "escrito_por", targetId: "agent_editor", sourcePath: "knowledge/concepts/alpha.md" },
          { sourceId: "ko_alpha", kind: "respaldado_por", targetId: "agent_reviewer", sourcePath: "knowledge/concepts/alpha.md" },
          { sourceId: "ko_alpha", kind: "validado_por", targetId: "agent_validator", sourcePath: "knowledge/concepts/alpha.md" },
        ],
        tasks: [],
      }),
    };

    const result = buildKnowledgeIndex(source, clock);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw result.error;
    expect(result.value.relationRecords).toEqual([
      {
        sourceId: "ko_alpha",
        sourcePath: "knowledge/concepts/alpha.md",
        relation: "se_apoya_en",
        targetId: "ko_beta",
        targetLabel: "Beta evidence",
        strength: "strong",
        kind: "core",
        derivesFrom: ["ko_evidence"],
        writtenBy: "agent_editor",
        endorsedBy: "agent_reviewer",
        validatedBy: "agent_validator",
      },
      {
        sourceId: "map_research",
        sourcePath: "maps/research.md",
        relation: "trata_sobre",
        targetId: "legacy_beta_reference",
        strength: "strong",
        kind: "core",
      },
      { sourceId: "ko_alpha", sourcePath: "knowledge/concepts/alpha.md", relation: "escrito_por", targetId: "agent_editor", strength: "strong", kind: "core" },
      { sourceId: "ko_alpha", sourcePath: "knowledge/concepts/alpha.md", relation: "respaldado_por", targetId: "agent_reviewer", strength: "strong", kind: "core" },
      { sourceId: "ko_alpha", sourcePath: "knowledge/concepts/alpha.md", relation: "validado_por", targetId: "agent_validator", strength: "strong", kind: "extended" },
    ]);
    expect(result.value.relationRecords).toBeDefined();
    const relationRecords = result.value.relationRecords ?? [];
    expect(new Set(relationRecords.map((relation) => `${relation.sourceId}:${relation.relation}:${relation.targetId}`)).size).toBe(5);
  });

  it("derives relation record defaults without adding empty compatibility fields", () => {
    const source: KnowledgeSourcePort = {
      load: () => ({
        objects: [
          { id: "ko_alpha", type: "concept", title: "Alpha", lifecycle: "living", created: "2026-01-01", attributes: {} },
          { id: "ko_beta", type: "concept", title: "Beta", lifecycle: "living", created: "2026-01-02", attributes: {} },
        ],
        relations: [{ sourceId: "ko_alpha", kind: "generaliza", targetId: "ko_beta" }],
        tasks: [],
      }),
    };

    const result = buildKnowledgeIndex(source, clock);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw result.error;
    expect(result.value.relationRecords).toEqual([
      { sourceId: "ko_alpha", relation: "generaliza", targetId: "ko_beta", strength: "strong", kind: "extended" },
    ]);
  });
});
