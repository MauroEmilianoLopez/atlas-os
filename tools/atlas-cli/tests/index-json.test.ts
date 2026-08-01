import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCoreIndex, writeIndexArtifacts } from "../src/adapters/index-json.js";
import type { AtlasIndex } from "../src/core/contracts.js";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-index-json-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("index-json adapter", () => {
  it("writes and reloads the core index without losing structured relation records", () => {
    const index: AtlasIndex = {
      objects: [
        {
          id: "ko_a",
          type: "concept",
          title: "A",
          lifecycle: "living",
          created: "2026-01-01",
          attributes: {},
          sourcePath: "knowledge/concepts/a.md",
        },
        {
          id: "ko_b",
          type: "concept",
          title: "B",
          lifecycle: "living",
          created: "2026-01-02",
          attributes: {},
          sourcePath: "knowledge/concepts/b.md",
        },
      ],
      relations: [
        {
          sourceId: "ko_a",
          kind: "se_apoya_en",
          targetId: "ko_b",
          traversalKind: "core",
          sourcePath: "knowledge/concepts/a.md",
        },
      ],
      relationRecords: [
        {
          sourceId: "ko_a",
          sourcePath: "knowledge/concepts/a.md",
          relation: "se_apoya_en",
          targetId: "ko_b",
          strength: "strong",
          kind: "core",
        },
      ],
      graph: {
        nodes: { ko_a: "ko_a", ko_b: "ko_b" },
        edges: { ko_a: ["ko_b"], ko_b: [] },
        reverseEdges: { ko_a: [], ko_b: ["ko_a"] },
      },
      tasks: [
        { id: "task_1", status: null, createdAt: null, sourcePath: "execution/tasks/log.md" },
      ],
      stats: {
        objects: 2,
        relations: 1,
        tasks: 1,
        types: { concept: 2 },
      },
      generatedAt: "2026-02-03T04:05:06.000Z",
    };

    writeIndexArtifacts(root, index, {
      clean: true,
      tasks: [
        {
          id: "task_1",
          date: "2026-02-03",
          agent: "agent_1",
          status: "committed",
          source_log: "execution/tasks/log.md",
          produced: ["ko_a"],
          cost: { tokens: 12, duration_ms: null },
        },
      ],
      stats: {
        generated_at: "2026-02-03T04:05:06.000Z",
        vault_path: "vault",
        files_scanned: 1,
        knowledge_objects: 2,
        relations: 1,
        tasks: 1,
        types: { concept: 2 },
        relations_by_type: { se_apoya_en: 1 },
        warnings: [],
        errors: [],
      },
    });

    expect(fs.existsSync(path.join(root, ".atlas", "index", "index.json"))).toBe(true);
    expect(fs.readFileSync(path.join(root, ".atlas", "index", "relations.json"), "utf-8")).toContain('"relation": "se_apoya_en"');

    const loaded = loadCoreIndex(root);
    expect(loaded).toMatchObject({
      generatedAt: "2026-02-03T04:05:06.000Z",
      objects: expect.arrayContaining([
        expect.objectContaining({ id: "ko_a", sourcePath: "knowledge/concepts/a.md" }),
      ]),
      relationRecords: expect.arrayContaining([
        expect.objectContaining({ sourceId: "ko_a", relation: "se_apoya_en", targetId: "ko_b" }),
      ]),
    });
  });
});
