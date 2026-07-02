import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIndex } from "../src/indexer.js";
import { INDEX_FILES, indexDir } from "../src/writer.js";

let root: string;

function write(rel: string, content: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
function ko(id: string, type: string, extra = ""): string {
  return `---\nid: ${id}\ntype: ${type}\ntitle: T\nlifecycle: living\ncreated: 2026-01-01\ntags: []\naliases: []\nderived:\n  managed_by: atlas-context-engine\n  cached: false\n${extra}---\n\n# T\n`;
}
function readJson(name: string) {
  return JSON.parse(fs.readFileSync(path.join(indexDir(root), name), "utf-8"));
}

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "atlasidx-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("buildIndex", () => {
  it("builds objects.json with all KOs", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept"));
    write("knowledge/concepts/b.md", ko("ko_b", "concept"));
    const r = buildIndex(root);
    expect(r.ok).toBe(true);
    const objs = readJson("objects.json");
    expect(objs).toHaveLength(2);
    expect(objs.map((o: any) => o.id).sort()).toEqual(["ko_a", "ko_b"]);
  });

  it("builds id-path.json and path-id.json correctly", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept"));
    buildIndex(root);
    const idPath = readJson("id-path.json");
    const pathId = readJson("path-id.json");
    expect(idPath["ko_a"]).toBe("knowledge/concepts/a.md");
    expect(pathId["knowledge/concepts/a.md"]).toBe("ko_a");
  });

  it("builds relations.json with strong relations", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept", "se_apoya_en:\n  - target_id: ko_b\n    label: B\n"));
    write("knowledge/concepts/b.md", ko("ko_b", "concept"));
    buildIndex(root);
    const rels = readJson("relations.json");
    const r = rels.find((x: any) => x.relation === "se_apoya_en");
    expect(r.source_id).toBe("ko_a");
    expect(r.target_id).toBe("ko_b");
    expect(r.kind).toBe("core");
    expect(r.target_label).toBe("B");
  });

  it("builds graph.json with edges and reverse_edges", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept", "trata_sobre:\n  - target_id: ko_b\n    label: B\n"));
    write("knowledge/concepts/b.md", ko("ko_b", "concept"));
    buildIndex(root);
    const g = readJson("graph.json");
    expect(g.edges["ko_a"][0].target_id).toBe("ko_b");
    expect(g.reverse_edges["ko_b"][0].source_id).toBe("ko_a");
  });

  it("indexes task logs into tasks.json", () => {
    write("execution/tasks/log.md", "---\nid: task_log_x\ntype: task_log\ntitle: L\nlifecycle: living\ncreated: 2026-01-01\n---\n\n```yaml\n- id: task_xyz\n  ejecutado_por: agent_1\n  estado: committed\n  created: 2026-06-29T09:00:00Z\n```\n");
    write("knowledge/concepts/a.md", ko("ko_a", "concept"));
    buildIndex(root);
    const tasks = readJson("tasks.json");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task_xyz");
    expect(tasks[0].agent).toBe("agent_1");
    expect(tasks[0].status).toBe("committed");
  });

  it("fails (and writes nothing) if the vault does not validate", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept", "se_apoya_en:\n  - target_id: ko_missing\n    label: M\n"));
    const r = buildIndex(root);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/validation/);
    expect(fs.existsSync(path.join(indexDir(root), "objects.json"))).toBe(false);
  });

  it("--clean removes the previous index before rebuilding", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept"));
    buildIndex(root);
    // drop a stale file into the index dir
    fs.writeFileSync(path.join(indexDir(root), "objects.json"), '[{"stale":true}]');
    buildIndex(root, { clean: true });
    const objs = readJson("objects.json");
    expect(objs[0].id).toBe("ko_a"); // rebuilt, not stale
  });

  it("does NOT index body wikilinks as strong relations", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept") .replace("# T", "# T\n\nSee [[b]] for more."));
    write("knowledge/concepts/b.md", ko("ko_b", "concept"));
    buildIndex(root);
    const rels = readJson("relations.json");
    // the only relations should be none (no YAML relations declared); wikilink in body ignored
    expect(rels.filter((r: any) => r.target_id === "ko_b")).toHaveLength(0);
  });

  it("stats.json reflects real counts", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept", "trata_sobre:\n  - target_id: ko_b\n    label: B\n"));
    write("knowledge/concepts/b.md", ko("ko_b", "concept"));
    buildIndex(root);
    const s = readJson("stats.json");
    expect(s.knowledge_objects).toBe(2);
    expect(s.types.concept).toBe(2);
    expect(s.relations_by_type.trata_sobre).toBe(1);
  });

  it("writes all expected index files", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept"));
    buildIndex(root);
    for (const f of INDEX_FILES) {
      expect(fs.existsSync(path.join(indexDir(root), f)), `missing ${f}`).toBe(true);
    }
  });
});
