import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  return spawnSync(process.execPath, [tsxCli, cliEntry, ...args], {
    cwd: cliRoot,
    encoding: "utf8",
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
    expect(result.stdout).toContain("Files scanned: 18");
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

  it("writes a Session State snapshot and makes continue render it first", () => {
    const update = runCli(
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
      "atlas continue published",
      "--pending",
      "Review the writer contract",
      "--decision",
      "Session state lives outside the Core",
    );

    expect(update.status).toBe(0);
    expect(update.stderr).toBe("");
    expect(update.stdout).toContain("Session State updated.");
    expect(update.stdout).toContain("work/session-state.md");
    expect(readFileSync(join(vault, "work", "session-state.md"), "utf8")).toContain("current_work_unit: 'feature/session-update'");

    const result = runCli("continue", "Atlas", vault);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.indexOf("## Estado del trabajo")).toBeLessThan(result.stdout.indexOf("## En qué estabas"));
    expect(result.stdout).toContain("- Work unit: **feature/session-update**");
    expect(result.stdout).toContain("- Próximo paso: Run the focused tests");
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
    const fromRepoRoot = runCliFrom(repositoryRoot, "continue", "Atlas");
    const fromCliRoot = runCliFrom(cliRoot, "continue", "Atlas");

    expect(fromRepoRoot.status).toBe(0);
    expect(fromRepoRoot.stderr).toBe("");
    expect(fromRepoRoot.stdout).toContain("# Continuar: Atlas OS");
    expect(fromRepoRoot.stdout).toContain("## Estado del trabajo");
    expect(fromRepoRoot.stdout).toContain("- Work unit: **feature/session-state**");
    expect(fromRepoRoot.stdout).toContain("- Rama: `feature/cli-continue`");
    expect(fromRepoRoot.stdout).toContain("- Próximo paso: Use atlas continue in daily work");
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
    expect(fromRepoRoot.stdout.indexOf("## Estado del trabajo")).toBeLessThan(fromRepoRoot.stdout.indexOf("## En qué estabas"));
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

    const result = runCliFrom(repositoryRoot, "continue", "Atlas", join(sandbox, "vault-no-state"));

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("## Estado del trabajo");
    expect(result.stdout).toContain("## En qué estabas");
    expect(result.stdout).toContain("## Contexto relacionado");
  });

  it("keeps continue tolerant when Session State is corrupt", () => {
    writeFileSync(join(vault, "work", "session-state.md"), "this is not a valid session state", "utf8");

    const result = runCliFrom(repositoryRoot, "continue", "Atlas", vault);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("## Estado del trabajo");
    expect(result.stdout).toContain("## En qué estabas");
    expect(result.stdout).toContain("## Contexto relacionado");
  });

  it("explains clearly when an explicit vault path does not exist", () => {
    const result = runCliFrom(repositoryRoot, "continue", "Atlas", join(repositoryRoot, "missing-vault"));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No se encontró un vault válido.");
    expect(result.stderr).toContain(join(repositoryRoot, "missing-vault"));
    expect(result.stderr).toContain("Ejecuta el comando desde el repositorio o pasa explícitamente la ruta del vault.");
  });
});
