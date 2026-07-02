import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIndex } from "../src/indexer.js";
import { loadIndex, resolveSeed, IndexNotBuiltError } from "../src/index-loader.js";

let root: string;
function write(rel: string, content: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
function ko(id: string, type: string, title: string, extra = ""): string {
  return `---\nid: ${id}\ntype: ${type}\ntitle: "${title}"\nlifecycle: living\ncreated: 2026-01-01\ntags: []\naliases: []\nderived:\n  managed_by: atlas-context-engine\n  cached: false\n${extra}---\n\n# ${title}\n`;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "atlasld-"));
  write("knowledge/concepts/backpressure.md", ko("ko_bp", "concept", "Backpressure"));
  write("knowledge/concepts/other.md", ko("ko_o", "concept", "Other", "se_apoya_en:\n  - target_id: ko_bp\n    label: Backpressure\n"));
  buildIndex(root);
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("index loader + seed resolution", () => {
  it("loads the built index", () => {
    const idx = loadIndex(root);
    expect(Object.keys(idx.graph.nodes).sort()).toEqual(["ko_bp", "ko_o"]);
    expect(idx.idPath["ko_bp"]).toBe("knowledge/concepts/backpressure.md");
  });

  it("throws IndexNotBuiltError when no index exists", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "atlasnone-"));
    expect(() => loadIndex(empty)).toThrow(IndexNotBuiltError);
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it("resolves a seed by exact id", () => {
    const idx = loadIndex(root);
    expect(resolveSeed(idx, "ko_bp")).toBe("ko_bp");
  });

  it("resolves a seed by file slug", () => {
    const idx = loadIndex(root);
    expect(resolveSeed(idx, "backpressure")).toBe("ko_bp");
  });

  it("resolves a seed by title (case-insensitive)", () => {
    const idx = loadIndex(root);
    expect(resolveSeed(idx, "backpressure")).toBe("ko_bp");
    expect(resolveSeed(idx, "BACKPRESSURE")).toBe("ko_bp");
  });

  it("returns null for an unresolvable seed", () => {
    const idx = loadIndex(root);
    expect(resolveSeed(idx, "does-not-exist")).toBeNull();
  });
});
