import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSessionState, renderSessionState, type SessionStateSnapshot } from "../src/session-state.js";

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
