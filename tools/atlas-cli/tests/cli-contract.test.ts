import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cliRoot = join(repositoryRoot, "tools", "atlas-cli");
const tsxCli = join(cliRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntry = join(cliRoot, "src", "cli.ts");
const fixtureVault = join(repositoryRoot, "vault-prototype");

let sandbox: string;
let vault: string;

function runCli(...args: string[]) {
  return runCliWithInput(undefined, ...args);
}

function runCliWithInput(input: string | undefined, ...args: string[]) {
  return runCliWithInputAndEnv(input, undefined, ...args);
}

function runCliWithInputAndEnv(input: string | undefined, env: NodeJS.ProcessEnv | undefined, ...args: string[]) {
  return spawnSync(process.execPath, [tsxCli, cliEntry, ...args], {
    cwd: cliRoot,
    encoding: "utf8",
    input,
    env: env ?? process.env,
  });
}

function runCliFrom(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [tsxCli, cliEntry, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [`${path}:${statSync(path).size}`];
  }).sort();
}

function sectionLines(stdout: string, header: string): string[] {
  const lines = stdout.split(/\r?\n/);
  const start = lines.indexOf(header);

  if (start < 0) {
    throw new Error(`Section not found: ${header}`);
  }

  const collected: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.startsWith("## ")) break;
    collected.push(line);
  }

  return collected;
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "atlas-cli-contract-"));
  vault = join(sandbox, "vault");
  cpSync(fixtureVault, vault, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("Atlas CLI compatibility contract", () => {
  it("keeps validate successful and reports its current summary", () => {
    const filesBefore = listFiles(vault);
    const result = runCli("validate", vault);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Atlas validation passed.");
    expect(result.stdout).toContain("Files scanned: 19");
    expect(result.stdout).toContain("Knowledge Objects: 13");
    expect(result.stdout).toContain("Errors: 0");
    expect(result.stdout).toContain("Warnings: 0");
    expect(listFiles(vault)).toEqual(filesBefore);
  });

  it("keeps index successful and writes its regenerable index files", () => {
    const result = runCli("index", vault);
    const indexDirectory = join(vault, ".atlas", "index");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Atlas index generated.");
    expect(result.stdout).toContain("Objects: 13");
    expect(result.stdout).toContain(`Output: ${vault}/.atlas/index/`);
    expect(existsSync(indexDirectory)).toBe(true);
    expect(readdirSync(indexDirectory).length).toBeGreaterThan(0);
  });

  it("keeps context successful after indexing and renders the selected seed", () => {
    expect(runCli("index", vault).status).toBe(0);

    const result = runCli("context", "context-engine", vault);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Context for: Context Engine");
    expect(result.stdout).toContain("Nodes (10):");
  });

  it("routes context JSON output through the Core contract instead of the legacy shape", () => {
    expect(runCli("index", vault).status).toBe(0);

    const result = runCli("context", "context-engine", vault, "--json");
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload).toMatchObject({
      seedId: "ko_01JZ000000000000000010",
      hops: 2,
      budget: 20,
      direction: "both",
      coreOnly: false,
      ranked: false,
      truncated: false,
    });
    expect(Array.isArray(payload.nodes)).toBe(true);
    expect(Array.isArray(payload.relations)).toBe(true);
    expect(payload).not.toHaveProperty("seed_id");
    expect(payload).not.toHaveProperty("edges");
  });

  it("treats a non-numeric hops value as seed-only without failing", () => {
    expect(runCli("index", vault).status).toBe(0);

    const result = runCli("context", "context-engine", vault, "--hops", "nope");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Context for: Context Engine");
    expect(result.stdout).toContain("Nodes (1):");
    expect(result.stdout).toContain("Edges (0):");
  });

  it("keeps numeric zero and negative hops seed-only", () => {
    expect(runCli("index", vault).status).toBe(0);

    const negative = runCli("context", "context-engine", vault, "--hops", "-1");
    const zero = runCli("context", "context-engine", vault, "--hops", "0");

    expect(negative.status).toBe(0);
    expect(negative.stderr).toBe("");
    expect(negative.stdout).toContain("Nodes (1):");
    expect(negative.stdout).toContain("Edges (0):");

    expect(zero.status).toBe(0);
    expect(zero.stderr).toBe("");
    expect(zero.stdout).toContain("Nodes (1):");
    expect(zero.stdout).toContain("Edges (0):");
  });

  it("keeps decimal hops accepted by the current CLI boundary", () => {
    expect(runCli("index", vault).status).toBe(0);

    const result = runCli("context", "context-engine", vault, "--hops", "1.5");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Context for: Context Engine");
    expect(result.stdout).toContain("Nodes (10):");
    expect(result.stdout).toContain("Edges (22):");
    expect(result.stdout).toMatch(/^\s+\[d2\]\s+/m);
    expect(result.stdout).toContain("[d2] event: RFC-002 aprobado");
  });

  it("keeps activation successful and writes a cache with every scored object", () => {
    expect(runCli("index", vault).status).toBe(0);

    const result = runCli("activation", vault);
    const cachePath = join(vault, ".atlas", "cache", "activation.json");
    const cache = JSON.parse(readFileSync(cachePath, "utf8")) as {
      generated_at: string;
      component: string;
      bands: Record<string, number>;
      entries: Record<string, { structural_score: number; band: string; title: string }>;
    };

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Atlas activation computed (structural component only).");
    expect(result.stdout).toContain("Objects scored: 13");
    expect(result.stdout).toContain("Bands — ACTIVO: 8  REACTIVABLE: 5  FRIO: 0");
    expect(result.stdout).toContain(`Cached: ${vault}/.atlas/cache/activation.json`);
    expect(result.stdout).toContain("Ranking (structural_score):");
    expect(result.stdout.indexOf("85  [ACTIVO")).toBeLessThan(result.stdout.indexOf("70  [ACTIVO"));
    expect(result.stdout.indexOf("70  [ACTIVO")).toBeLessThan(result.stdout.indexOf("64  [ACTIVO"));
    expect(existsSync(cachePath)).toBe(true);
    expect(Object.keys(cache.entries)).toHaveLength(13);
    expect(cache.bands).toEqual({ ACTIVO: 8, REACTIVABLE: 5, FRIO: 0 });
  });

  it("keeps activation JSON output identical to the persisted cache", () => {
    expect(runCli("index", vault).status).toBe(0);

    const result = runCli("activation", vault, "--json");
    const cachePath = join(vault, ".atlas", "cache", "activation.json");
    const cache = JSON.parse(readFileSync(cachePath, "utf8"));
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload).toEqual(cache);
    expect(payload).toMatchObject({
      generated_at: expect.any(String),
      component: "structural",
      bands: { ACTIVO: 8, REACTIVABLE: 5, FRIO: 0 },
    });
  });

  it("updates V2 state after approval and makes continue render it first", () => {
    const update = runCliWithInput("y\n",
      "session",
      "update",
      "--vault",
      vault,
      "--work-unit",
      "feature/session-update",
      "--branch",
      "feature/cli-session-update",
      "--goal",
      "Automate the operational session snapshot",
      "--status",
      "published",
      "--next-step",
      "Run the focused tests",
      "--completed",
      "atlas continue published",
      "--pending",
      "Review the writer contract",
    );

    expect(update.status).toBe(0);
    expect(update.stderr).toBe("");
    expect(update.stdout).toContain("Session State updated.");
    expect(update.stdout).toContain("work/session-state.md");
    expect(readFileSync(join(vault, "work", "session-state.md"), "utf8")).toContain("work_unit: 'feature/session-update'");

    const result = runCli("continue", "Atlas", vault, "--agent", "codex");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.indexOf("## Estado actual compartido")).toBeLessThan(result.stdout.indexOf("## En qué estabas"));
    expect(result.stdout).toContain("- Work unit: **feature/session-update**");
    expect(result.stdout).toContain("- Próximo paso: Run the focused tests");
  });

  it("preserves the complete V2 decision history when no decision is supplied", () => {
    const sessionStatePath = join(vault, "work", "session-state.md");
    const before = readFileSync(sessionStatePath, "utf8");
    const result = runCliWithInput("y\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next");

    expect(result.status).toBe(0);
    const after = readFileSync(sessionStatePath, "utf8");
    expect(after.slice(after.indexOf("## Historial de decisiones"))).toBe(before.slice(before.indexOf("## Historial de decisiones")));
  });

  it("appends one decision without changing the existing V2 history", () => {
    const sessionStatePath = join(vault, "work", "session-state.md");
    const before = readFileSync(sessionStatePath, "utf8");
    expect(spawnSync("git", ["init"], { cwd: vault, encoding: "utf8" }).status).toBe(0);
    expect(spawnSync("git", ["add", "."], { cwd: vault, encoding: "utf8" }).status).toBe(0);
    expect(spawnSync("git", ["-c", "user.name=Atlas Test", "-c", "user.email=atlas@example.test", "commit", "-m", "fixture"], { cwd: vault, encoding: "utf8" }).status).toBe(0);
    const result = runCliWithInput("y\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/new", "--goal", "Update V2", "--status", "published", "--next-step", "Next", "--decision", "New decision");

    expect(result.status).toBe(0);
    const after = readFileSync(sessionStatePath, "utf8");
    expect(after).toContain(before.slice(before.indexOf("## Historial de decisiones")).trimEnd());
    expect(after).toMatch(/decisión: New decision/);
  });

  it("uses the actual short HEAD for a new decision", () => {
    expect(spawnSync("git", ["init"], { cwd: vault, encoding: "utf8" }).status).toBe(0);
    expect(spawnSync("git", ["add", "."], { cwd: vault, encoding: "utf8" }).status).toBe(0);
    expect(spawnSync("git", ["-c", "user.name=Atlas Test", "-c", "user.email=atlas@example.test", "commit", "-m", "fixture"], { cwd: vault, encoding: "utf8" }).status).toBe(0);
    const result = runCliWithInput("yes\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/new", "--goal", "Update V2", "--status", "published", "--next-step", "Next", "--decision", "New decision");
    const expectedHead = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: vault, encoding: "utf8" }).stdout.trim();

    expect(result.status).toBe(0);
    expect(readFileSync(join(vault, "work", "session-state.md"), "utf8")).toContain(`base ${expectedHead}`);
  });

  it("shows the full diff before the exact approval prompt", () => {
    const result = runCliWithInput("n\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--- work/session-state.md");
    expect(result.stdout.indexOf("--- work/session-state.md")).toBeLessThan(result.stdout.indexOf("Apply this Session State update? [y/N]"));
  });

  it("writes when approval is y", () => {
    const path = join(vault, "work", "session-state.md");
    const before = readFileSync(path, "utf8");
    const result = runCliWithInput("y\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next");
    expect(result.status).toBe(0); expect(readFileSync(path, "utf8")).not.toBe(before);
  });

  it("writes when approval is yes", () => {
    const path = join(vault, "work", "session-state.md");
    const before = readFileSync(path, "utf8");
    const result = runCliWithInput("YES\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next");
    expect(result.status).toBe(0); expect(readFileSync(path, "utf8")).not.toBe(before);
  });

  it.each<[string | undefined, string]>([["\n", "empty Enter"], ["n\n", "n"], [undefined, "EOF"]])("does not write when approval is %s", (input, _label) => {
    const path = join(vault, "work", "session-state.md");
    const before = readFileSync(path, "utf8");
    const result = runCliWithInput(input, "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next");
    expect(result.status).toBe(0); expect(result.stdout).toContain("Session State update canceled."); expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("does not need Git when no decision is supplied", () => {
    const result = runCliWithInput("y\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next");
    expect(result.status).toBe(0);
  });

  it("aborts before rendering or writing when Git cannot determine a new decision base", () => {
    const path = join(vault, "work", "session-state.md");
    const before = readFileSync(path, "utf8");
    const result = runCliWithInputAndEnv("y\n", { ...process.env, PATH: "" }, "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next", "--decision", "New decision");
    expect(result.status).toBe(1); expect(result.stderr).toContain("Could not determine the base commit"); expect(result.stdout).not.toContain("Apply this Session State update?"); expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("reads only the approval line, without waiting for EOF", () => {
    const path = join(vault, "work", "session-state.md");
    const before = readFileSync(path, "utf8");
    const result = runCliWithInput("y\ntrailing input", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next");

    expect(result.status).toBe(0);
    expect(readFileSync(path, "utf8")).not.toBe(before);
  });

  it("resolves a new decision base from the vault root", () => {
    const init = spawnSync("git", ["init"], { cwd: vault, encoding: "utf8" });
    expect(init.status).toBe(0);
    expect(spawnSync("git", ["add", "."], { cwd: vault, encoding: "utf8" }).status).toBe(0);
    expect(spawnSync("git", ["-c", "user.name=Atlas Test", "-c", "user.email=atlas@example.test", "commit", "-m", "fixture"], { cwd: vault, encoding: "utf8" }).status).toBe(0);
    const expectedHead = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: vault, encoding: "utf8" }).stdout.trim();

    const result = runCliWithInput("y\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next", "--decision", "New decision");

    expect(result.status).toBe(0);
    expect(readFileSync(join(vault, "work", "session-state.md"), "utf8")).toContain(`base ${expectedHead}`);
  });

  it.each(["active", "draft", "ready_for_review"])("rejects non-closing Session State status %s", (status) => {
    const path = join(vault, "work", "session-state.md");
    const before = readFileSync(path, "utf8");
    const result = runCliWithInput("y\n", "session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", status, "--next-step", "Next");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(status === "draft" ? "Session State status must be one of:" : "Session State updates require a closing status");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("rejects a multiline Session State decision before rendering or writing", () => {
    const path = join(vault, "work", "session-state.md");
    const before = readFileSync(path, "utf8");
    const result = runCli("session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", "feature/v2", "--goal", "Update V2", "--status", "published", "--next-step", "Next", "--decision", "First line\nSecond line");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Session State decision must be a single line.");
    expect(result.stdout).not.toContain("Apply this Session State update?");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it.each(["feature/one\ntwo", "feature/one\rtwo"])("rejects a multiline Session State branch before rendering or writing", (branch) => {
    const path = join(vault, "work", "session-state.md");
    const before = readFileSync(path, "utf8");
    const result = runCli("session", "update", "--vault", vault, "--work-unit", "feature/v2", "--branch", branch, "--goal", "Update V2", "--status", "published", "--next-step", "Next");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Session State branch must be a single line.");
    expect(result.stdout).not.toContain("--- work/session-state.md");
    expect(result.stdout).not.toContain("Apply this Session State update?");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it.each([
    ["work unit", "--work-unit"],
    ["goal", "--goal"],
    ["next step", "--next-step"],
    ["completed item", "--completed"],
    ["pending item", "--pending"],
  ] as const)("rejects a CR/LF Session State %s before rendering or writing", (_label, option) => {
    for (const value of ["first\nsecond", "first\rsecond"]) {
      const path = join(vault, "work", "session-state.md");
      const before = readFileSync(path, "utf8");
      const valueFor = (name: string, fallback: string): string => option === name ? value : fallback;
      const args = [
        "session", "update", "--vault", vault,
        "--work-unit", valueFor("--work-unit", "feature/v2"),
        "--branch", "feature/v2",
        "--goal", valueFor("--goal", "Update V2"),
        "--status", "published",
        "--next-step", valueFor("--next-step", "Next"),
      ];
      if (option === "--completed" || option === "--pending") args.push(option, value);
      const result = runCli(...args);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("single line");
      expect(result.stdout).not.toContain("--- work/session-state.md");
      expect(result.stdout).not.toContain("Apply this Session State update?");
      expect(readFileSync(path, "utf8")).toBe(before);
    }
  });

  it("fails session update when a required field is missing without changing the snapshot", () => {
    const sessionStatePath = join(vault, "work", "session-state.md");
    const before = readFileSync(sessionStatePath, "utf8");

    const result = runCli(
      "session",
      "update",
      "--vault",
      vault,
      "--work-unit",
      "feature/session-update",
      "--branch",
      "feature/cli-session-update",
      "--goal",
      "Automate the operational session snapshot",
      "--status",
      "ready_to_commit",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("required option '--next-step <step>' not specified");
    expect(readFileSync(sessionStatePath, "utf8")).toBe(before);
  });

  it("fails session update when completed exceeds the limit without changing the snapshot", () => {
    const sessionStatePath = join(vault, "work", "session-state.md");
    const before = readFileSync(sessionStatePath, "utf8");

    const result = runCli(
      "session",
      "update",
      "--vault",
      vault,
      "--work-unit",
      "feature/session-update",
      "--branch",
      "feature/cli-session-update",
      "--goal",
      "Automate the operational session snapshot",
      "--status",
      "ready_to_commit",
      "--next-step",
      "Run the focused tests",
      "--completed",
      "a",
      "--completed",
      "b",
      "--completed",
      "c",
      "--completed",
      "d",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Session State field "completed" must contain at most 3 items.');
    expect(readFileSync(sessionStatePath, "utf8")).toBe(before);
  });

  it("fails session update when status is invalid without changing the snapshot", () => {
    const sessionStatePath = join(vault, "work", "session-state.md");
    const before = readFileSync(sessionStatePath, "utf8");

    const result = runCli(
      "session",
      "update",
      "--vault",
      vault,
      "--work-unit",
      "feature/session-update",
      "--branch",
      "feature/cli-session-update",
      "--goal",
      "Automate the operational session snapshot",
      "--status",
      "invalid",
      "--next-step",
      "Run the focused tests",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Session State status must be one of:");
    expect(readFileSync(sessionStatePath, "utf8")).toBe(before);
  });

  it("creates a single Markdown brief for resuming a topic without requiring prior index or activation runs", () => {
    const fromRepoRoot = runCliFrom(repositoryRoot, "continue", "Atlas", "--agent", "codex");
    const fromCliRoot = runCliFrom(cliRoot, "continue", "Atlas", "--agent", "codex");

    expect(fromRepoRoot.status).toBe(0);
    expect(fromRepoRoot.stderr).toBe("");
    expect(fromRepoRoot.stdout).toContain("# Continuar: Atlas OS");
    expect(fromRepoRoot.stdout).toContain("## Estado actual compartido");
    expect(fromRepoRoot.stdout).toContain("- Work unit: **feature/session-update**");
    expect(fromRepoRoot.stdout).toContain("- Rama: `feature/session-update`");
    expect(fromRepoRoot.stdout).toContain("- Próximo paso: Define the next Atlas slice");
    expect(fromRepoRoot.stdout).toContain("## En qué estabas");
    expect(fromRepoRoot.stdout).toContain("## Próximo paso");
    expect(fromRepoRoot.stdout).toContain("## Decisiones vigentes");
    expect(fromRepoRoot.stdout).toContain("## Contexto relacionado");
    expect(fromRepoRoot.stdout).toContain("## Archivos para abrir");
    expect(fromRepoRoot.stdout).toContain("La decisión vigente más sensible es **ADR-001 — Usar IDs estables en vez de paths como identidad**.");
    expect(sectionLines(fromRepoRoot.stdout, "## Decisiones vigentes")).toEqual([
      "- [d1] **ADR-001 — Usar IDs estables en vez de paths como identidad** (decision) — score `85` — `work/decisions/adr-001-use-ids-over-paths.md`",
    ]);
    expect(fromRepoRoot.stdout).toContain("- **ADR-001 — Usar IDs estables en vez de paths como identidad** (decision) — `work/decisions/adr-001-use-ids-over-paths.md`");
    expect(fromRepoRoot.stdout).toContain("- **Context Engine** (concept) — `knowledge/concepts/context-engine.md`");
    expect(fromRepoRoot.stdout).toContain("- **El contexto se construye, no se lee** (insight) — `knowledge/insights/context-is-not-memory.md`");
    expect(fromRepoRoot.stdout.indexOf("## Estado actual compartido")).toBeLessThan(fromRepoRoot.stdout.indexOf("## En qué estabas"));
    expect(sectionLines(fromRepoRoot.stdout, "## Contexto relacionado")).toEqual([
      "- **ADR-001 — Usar IDs estables en vez de paths como identidad** (decision) — `work/decisions/adr-001-use-ids-over-paths.md`",
      "- **Context Engine** (concept) — `knowledge/concepts/context-engine.md`",
      "- **El contexto se construye, no se lee** (insight) — `knowledge/insights/context-is-not-memory.md`",
    ]);
    expect(sectionLines(fromRepoRoot.stdout, "## Archivos para abrir")).toEqual([
      "1. Primero `work/decisions/adr-001-use-ids-over-paths.md`",
      "2. `knowledge/concepts/context-engine.md`",
      "3. `work/initiatives/2026-atlas-os.md`",
      "4. `knowledge/insights/context-is-not-memory.md`",
      "5. `execution/agents/claude-research-agent.md`",
    ]);
    expect(fromRepoRoot.stdout).not.toContain("Seed:");
    expect(fromRepoRoot.stdout).not.toContain("Validate:");
    expect(fromRepoRoot.stdout).not.toContain("files scanned");
    expect(fromRepoRoot.stdout).not.toContain("knowledge objects");
    expect(fromRepoRoot.stdout).not.toContain("relations");
    expect(fromRepoRoot.stdout).not.toContain("tasks");

    expect(fromCliRoot.status).toBe(0);
    expect(fromCliRoot.stderr).toBe("");
    expect(fromCliRoot.stdout).toBe(fromRepoRoot.stdout);
  });

  it("keeps the current brief when Session State is absent", () => {
    cpSync(fixtureVault, join(sandbox, "vault-no-state"), { recursive: true });
    rmSync(join(sandbox, "vault-no-state", "work", "session-state.md"), { force: true });

    const result = runCliFrom(repositoryRoot, "continue", "Atlas", join(sandbox, "vault-no-state"), "--agent", "codex");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("## Estado actual compartido");
    expect(result.stdout).toContain("## En qué estabas");
    expect(result.stdout).toContain("## Contexto relacionado");
  });

  it("keeps continue tolerant when Session State is corrupt", () => {
    writeFileSync(join(vault, "work", "session-state.md"), "this is not a valid session state", "utf8");

    const result = runCliFrom(repositoryRoot, "continue", "Atlas", vault, "--agent", "codex");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("## Estado actual compartido");
    expect(result.stdout).toContain("## En qué estabas");
    expect(result.stdout).toContain("## Contexto relacionado");
  });

  it("explains clearly when an explicit vault path does not exist", () => {
    const result = runCliFrom(repositoryRoot, "continue", "Atlas", join(repositoryRoot, "missing-vault"), "--agent", "codex");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No se encontró un vault válido.");
    expect(result.stderr).toContain(join(repositoryRoot, "missing-vault"));
    expect(result.stderr).toContain("Ejecuta el comando desde el repositorio o pasa explícitamente la ruta del vault.");
  });

  it("requires a safe explicit agent for continue", () => {
    const missing = runCli("continue", "Atlas", vault);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("required option '--agent <name>' not specified");

    for (const agent of ["", "claude/code", "claude\\code", ".."] as const) {
      const result = runCli("continue", "Atlas", vault, "--agent", agent);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("agent");
    }
  });

  it("renders V2 shared state, non-empty scratch, and the latest five decisions before structural context", () => {
    writeFileSync(
      join(vault, "work", "session-state.md"),
      [
        "# Session State", "", "## Estado actual", "", "work_unit: 'feature/session-update'", "branch: 'feature/session-update'", "objetivo_actual: 'Close slice'", "estado: published", "completados:", "  - 'Done'", "pendientes: []", "proximo_paso: 'Next'", "", "## Historial de decisiones", "",
        ...Array.from({ length: 6 }, (_, index) => [
          `## 2026-08-0${index + 1} 10:00 — feature/test — base abc${index}`,
          "",
          `decisión: Decision ${index + 1}`,
          "",
          `context: Context ${index + 1}.`,
          "",
        ].join("\n")),
      ].join("\n"),
      "utf8",
    );
    mkdirSync(join(vault, "work", ".scratch"), { recursive: true });
    writeFileSync(join(vault, "work", ".scratch", "codex.md"), "Scratch note", "utf8");

    const result = runCli("continue", "Atlas", vault, "--agent", "codex");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## Estado actual compartido");
    expect(result.stdout).toContain("## Scratch del agente (codex)");
    expect(result.stdout).toContain("Scratch note");
    expect(result.stdout).not.toContain("Decision 1");
    for (const decision of ["Decision 2", "Decision 3", "Decision 4", "Decision 5", "Decision 6"]) {
      expect(result.stdout).toContain(decision);
    }
    expect(result.stdout.indexOf("## Estado actual compartido")).toBeLessThan(result.stdout.indexOf("## Scratch del agente (codex)"));
    expect(result.stdout.indexOf("## Scratch del agente (codex)")).toBeLessThan(result.stdout.indexOf("Decision 2"));
    expect(result.stdout.indexOf("Decision 2")).toBeLessThan(result.stdout.indexOf("## En qué estabas"));
  });

  it("continues with scratch and structural context when V2 Session State is missing or corrupt", () => {
    rmSync(join(vault, "work", "session-state.md"), { force: true });
    mkdirSync(join(vault, "work", ".scratch"), { recursive: true });
    writeFileSync(join(vault, "work", ".scratch", "codex.md"), "Scratch only", "utf8");

    const missing = runCli("continue", "Atlas", vault, "--agent", "codex");
    expect(missing.status).toBe(0);
    expect(missing.stdout).toContain("Scratch only");
    expect(missing.stdout).toContain("## En qué estabas");

    writeFileSync(join(vault, "work", "session-state.md"), "corrupt", "utf8");
    const corrupt = runCli("continue", "Atlas", vault, "--agent", "codex");
    expect(corrupt.status).toBe(0);
    expect(corrupt.stdout).toContain("Scratch only");
    expect(corrupt.stdout).toContain("## En qué estabas");
  });

  it("omits a missing or empty agent scratch file without failing", () => {
    const absent = runCli("continue", "Atlas", vault, "--agent", "codex");
    expect(absent.status).toBe(0);
    expect(absent.stdout).not.toContain("## Scratch del agente");

    mkdirSync(join(vault, "work", ".scratch"), { recursive: true });
    writeFileSync(join(vault, "work", ".scratch", "codex.md"), "  \n\t", "utf8");
    const empty = runCli("continue", "Atlas", vault, "--agent", "codex");
    expect(empty.status).toBe(0);
    expect(empty.stdout).not.toContain("## Scratch del agente");
  });
});
