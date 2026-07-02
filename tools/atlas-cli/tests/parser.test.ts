import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFile } from "../src/parser.js";

let dir: string;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-")); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("parser", () => {
  it("parses valid frontmatter", () => {
    const f = path.join(dir, "ok.md");
    fs.writeFileSync(f, "---\nid: ko_1\ntype: concept\ntitle: X\nlifecycle: living\ncreated: 2026-01-01\nderived:\n  managed_by: e\n  cached: false\n---\n\n# X\n");
    const p = parseFile(f, dir);
    expect(p.hasFrontmatter).toBe(true);
    expect(p.frontmatter.id).toBe("ko_1");
    expect(p.frontmatter.type).toBe("concept");
  });

  it("throws on invalid YAML", () => {
    const f = path.join(dir, "bad.md");
    fs.writeFileSync(f, "---\nid: ko_1\n  : : broken\n   bad indent\n---\n\n# X\n");
    expect(() => parseFile(f, dir)).toThrow(/Invalid YAML/);
  });

  it("treats a file without fence as no-frontmatter", () => {
    const f = path.join(dir, "plain.md");
    fs.writeFileSync(f, "# just text\n");
    const p = parseFile(f, dir);
    expect(p.hasFrontmatter).toBe(false);
  });
});
