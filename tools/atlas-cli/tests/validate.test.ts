import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateVault } from "../src/validate.js";
import { collectTaskIds } from "../src/task-log.js";
import { validateKnowledgeBase } from "../src/core/validate.js";
import { SourceUnavailableError } from "../src/core/errors.js";
import type { KnowledgeSourcePort } from "../src/core/ports.js";

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

describe("validateKnowledgeBase", () => {
  it("validates a normalized fake source and reports canonical counts", () => {
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

    expect(validateKnowledgeBase(source)).toEqual({
      ok: true,
      filesScanned: 2,
      knowledgeObjects: 2,
      relationsChecked: 1,
      taskRefsChecked: 0,
      taskLogs: 0,
      errors: [],
      warnings: [],
      issues: [],
    });
  });

  it("keeps source diagnostics continuable while exposing legacy counts and render-ready groups", () => {
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
        relations: [],
        tasks: [],
        validation: {
          filesScanned: 4,
          taskLogs: 2,
          diagnostics: [
            {
              code: "INVALID_YAML",
              message: "Invalid YAML: bad indentation",
              severity: "error",
              sourcePath: "knowledge/concepts/broken.md",
            },
            {
              code: "DERIVED_CACHE",
              message: "derived.cached should be false in P1 (got true)",
              severity: "warning",
              sourcePath: "knowledge/concepts/alpha.md",
            },
          ],
        },
      }),
    };

    expect(validateKnowledgeBase(source)).toMatchObject({
      ok: false,
      filesScanned: 4,
      knowledgeObjects: 1,
      relationsChecked: 0,
      taskRefsChecked: 0,
      taskLogs: 2,
      errors: [{ level: "error", file: "knowledge/concepts/broken.md", message: "Invalid YAML: bad indentation" }],
      warnings: [{ level: "warning", file: "knowledge/concepts/alpha.md", message: "derived.cached should be false in P1 (got true)" }],
      issues: [
        expect.objectContaining({ code: "INVALID_YAML", severity: "error", sourcePath: "knowledge/concepts/broken.md" }),
        expect.objectContaining({ code: "DERIVED_CACHE", severity: "warning", sourcePath: "knowledge/concepts/alpha.md" }),
      ],
    });
  });

  it("renders domain diagnostics against the adapter-provided source location", () => {
    const source: KnowledgeSourcePort = {
      load: () => ({
        objects: [
          {
            id: "ko_agent",
            type: "agent",
            title: "Agent",
            lifecycle: "living",
            created: "2026-01-01",
            attributes: {},
            sourcePath: "execution/agents/agent.md",
          },
        ],
        relations: [],
        tasks: [],
      }),
    };

    const report = validateKnowledgeBase(source);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      {
        level: "error",
        file: "execution/agents/agent.md",
        message: "Knowledge object id prefix does not match type: agent",
      },
    ]);
  });

  it("reports invalid canonical ids, derived fields, relations, and task references", () => {
    const source: KnowledgeSourcePort = {
      load: () => ({
        objects: [
          {
            id: "agent_wrong",
            type: "concept",
            title: "Invalid",
            lifecycle: "living",
            created: "2026-01-01",
            attributes: { activation_score: 99 },
          },
          {
            id: "agent_wrong",
            type: "agent",
            title: "Duplicate",
            lifecycle: "living",
            created: "2026-01-02",
            attributes: {},
          },
        ],
        relations: [
          { sourceId: "agent_wrong", kind: "supports", targetId: "ko_missing" },
          { sourceId: "agent_wrong", kind: "produces", targetId: "task_missing" },
        ],
        tasks: [],
      }),
    };

    const report = validateKnowledgeBase(source);

    expect(report.ok).toBe(false);
    expect(report.relationsChecked).toBe(2);
    expect(report.taskRefsChecked).toBe(1);
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "DUPLICATE_ID",
      "ID_PREFIX_MISMATCH",
      "DERIVED_FIELD_MANUAL",
      "UNKNOWN_RELATION_TARGET",
      "UNKNOWN_TASK_REFERENCE",
    ]);
  });

  it("propagates typed source failures and wraps unknown source failures", () => {
    const unavailable = new SourceUnavailableError("Knowledge source is unavailable");
    const typedFailure: KnowledgeSourcePort = { load: () => { throw unavailable; } };
    const unknownFailure: KnowledgeSourcePort = { load: () => { throw new Error("offline"); } };

    expect(() => validateKnowledgeBase(typedFailure)).toThrow(unavailable);
    expect(() => validateKnowledgeBase(unknownFailure)).toThrow(SourceUnavailableError);
    expect(() => validateKnowledgeBase(unknownFailure)).toThrow("Knowledge source is unavailable");
  });
});
