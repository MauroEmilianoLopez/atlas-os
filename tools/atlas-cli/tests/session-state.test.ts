import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  normalizeSessionStateUpdate,
  readSessionState,
  renderSessionState,
  writeSessionState,
  type SessionStateSnapshot,
} from "../src/session-state.js";

let sandbox: string;
let vault: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "atlas-session-state-"));
  vault = join(sandbox, "vault");
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("session state", () => {
  it("round-trips a valid snapshot", () => {
    const snapshot: SessionStateSnapshot = {
      schemaVersion: 1,
      updatedAt: "2026-08-03T10:00:00-03:00",
      currentWorkUnit: "feature/session-state",
      currentBranch: "feature/cli-continue",
      currentGoal: "Add a minimal session state to improve continue",
      status: "ready_for_review",
      completed: ["atlas continue published"],
      pending: ["validate session state with a fresh chat"],
      nextStep: "Run the dogfood test",
      lastDecisions: [
        "Session state lives outside the Core",
        "Single snapshot only, no conversation history",
      ],
    };

    mkdirSync(join(vault, "work"), { recursive: true });
    writeFileSync(join(vault, "work", "session-state.md"), renderSessionState(snapshot), "utf8");

    const result = readSessionState(vault);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual(snapshot);
    expect(renderSessionState(result.value)).toContain("## Recent Decisions");
    expect(readFileSync(join(vault, "work", "session-state.md"), "utf8")).toContain("schema_version: 1");
  });

  it("accepts an update payload with omitted optional lists", () => {
    const result = normalizeSessionStateUpdate({
      currentWorkUnit: "feature/session-update",
      currentBranch: "feature/cli-session-update",
      currentGoal: "Automate the operational session snapshot",
      status: "ready_to_commit",
      nextStep: "Run the focused tests",
      updatedAt: "2026-08-03T22:20:00-03:00",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    mkdirSync(join(vault, "work"), { recursive: true });
    writeSessionState(vault, result.value);

    const read = readSessionState(vault);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.value.completed).toEqual([]);
    expect(read.value.pending).toEqual([]);
    expect(read.value.lastDecisions).toEqual([]);
  });

  it("rejects invalid update payloads conservatively", () => {
    const missing = normalizeSessionStateUpdate({
      currentWorkUnit: "",
      currentBranch: "feature/cli-session-update",
      currentGoal: "Automate the operational session snapshot",
      status: "ready_to_commit",
      nextStep: "Run the focused tests",
    } as never);

    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.message).toContain("current_work_unit");

    const invalidStatus = normalizeSessionStateUpdate({
      currentWorkUnit: "feature/session-update",
      currentBranch: "feature/cli-session-update",
      currentGoal: "Automate the operational session snapshot",
      status: "publishedly",
      nextStep: "Run the focused tests",
    } as never);

    expect(invalidStatus.ok).toBe(false);
    if (invalidStatus.ok) return;
    expect(invalidStatus.message).toContain("status must be one of");

    for (const [key, payload] of [
      ["completed", { completed: ["a", "b", "c", "d"] }],
      ["pending", { pending: ["a", "b", "c", "d"] }],
      ["last_decisions", { lastDecisions: ["a", "b", "c", "d"] }],
    ] as const) {
      const tooMany = normalizeSessionStateUpdate({
        currentWorkUnit: "feature/session-update",
        currentBranch: "feature/cli-session-update",
        currentGoal: "Automate the operational session snapshot",
        status: "ready_to_commit",
        nextStep: "Run the focused tests",
        ...payload,
      });

      expect(tooMany.ok).toBe(false);
      if (tooMany.ok) return;
      expect(tooMany.message).toContain(key);
      expect(tooMany.message).toContain("at most 3");
    }
  });

  it("reports a missing snapshot without failing the caller", () => {
    const result = readSessionState(vault);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe("missing");
    expect(result.message).toContain("session-state.md");
  });

  it("rejects malformed or incomplete snapshots conservatively", () => {
    mkdirSync(join(vault, "work"), { recursive: true });
    writeFileSync(
      join(vault, "work", "session-state.md"),
      [
        "schema_version: 1",
        "# Session State",
        "",
        "## Completed",
        "- atlas continue published",
      ].join("\n"),
      "utf8",
    );

    const result = readSessionState(vault);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe("invalid");
    expect(result.message).toContain("required sections");
  });
});
