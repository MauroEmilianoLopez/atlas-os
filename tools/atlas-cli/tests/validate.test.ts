import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateVault } from "../src/validate.js";
import { collectTaskIds } from "../src/task-log.js";

let root: string;

function write(rel: string, content: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function ko(id: string, type: string, extra = ""): string {
  return `---\nid: ${id}\ntype: ${type}\ntitle: T\nlifecycle: living\ncreated: 2026-01-01\nderived:\n  managed_by: atlas-context-engine\n  cached: false\n${extra}---\n\n# T\n`;
}

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "atlasv-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("validateVault", () => {
  it("passes on a clean minimal vault", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept"));
    const r = validateVault(root);
    expect(r.ok).toBe(true);
    expect(r.knowledgeObjects).toBe(1);
    expect(r.errors).toHaveLength(0);
  });

  it("fails with an actionable error when the vault path does not exist", () => {
    const missingVault = path.join(root, "missing-vault");
    const r = validateVault(missingVault);

    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      {
        level: "error",
        file: missingVault,
        message: `Vault path does not exist: ${missingVault}. Check the path and try again.`,
      },
    ]);
  });

  it("detects a duplicate id", () => {
    write("knowledge/concepts/a.md", ko("ko_dup", "concept"));
    write("knowledge/concepts/b.md", ko("ko_dup", "concept"));
    const r = validateVault(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /duplicate id/.test(e.message))).toBe(true);
  });

  it("detects a target_id pointing to an unknown id", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept", "se_apoya_en:\n  - target_id: ko_missing\n    label: M\n"));
    const r = validateVault(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /unknown id ko_missing/.test(e.message))).toBe(true);
  });

  it("resolves a relation across two existing KOs", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept", "se_apoya_en:\n  - target_id: ko_b\n    label: B\n"));
    write("knowledge/concepts/b.md", ko("ko_b", "concept"));
    const r = validateVault(root);
    expect(r.ok).toBe(true);
    expect(r.relationsChecked).toBeGreaterThanOrEqual(1);
  });

  it("rejects a wrong prefix for the type", () => {
    write("execution/agents/a.md", ko("ko_a", "agent")); // agent should be agent_
    const r = validateVault(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /prefix does not match type/.test(e.message))).toBe(true);
  });

  it("rejects a manually-written derived field", () => {
    write("knowledge/concepts/a.md", ko("ko_a", "concept", "activation_score: 99\n"));
    const r = validateVault(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /must not be set manually/.test(e.message))).toBe(true);
  });

  it("resolves a task_id from the task log", () => {
    write("execution/tasks/log.md", "---\nid: task_log_x\ntype: task_log\ntitle: L\nlifecycle: living\ncreated: 2026-01-01\n---\n\n```yaml\n- id: task_xyz\n```\n");
    write("work/artifacts/a.md", ko("ko_a", "artifact", "produjo:\n  - target_id: task_xyz\n    label: T\n"));
    const ids = collectTaskIds(root);
    expect(ids.has("task_xyz")).toBe(true);
    const r = validateVault(root);
    expect(r.ok).toBe(true);
    expect(r.taskRefsChecked).toBe(1);
  });

  it("fails when a task reference does not exist in the log", () => {
    write("work/artifacts/a.md", ko("ko_a", "artifact", "produjo:\n  - target_id: task_nope\n    label: T\n"));
    const r = validateVault(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /unknown task task_nope/.test(e.message))).toBe(true);
  });

  it("flags invalid YAML", () => {
    write("knowledge/concepts/bad.md", "---\nid: ko_a\n : : broken\n  bad\n---\n# x\n");
    const r = validateVault(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Invalid YAML/.test(e.message))).toBe(true);
  });
});
