import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cliRoot = join(repositoryRoot, "tools", "atlas-cli");
const tsxCli = join(cliRoot, "node_modules", "tsx", "dist", "cli.mjs");
const fixtureVault = join(repositoryRoot, "vault-prototype");

let sandbox: string;
let vault: string;

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [tsxCli, "src/cli.ts", ...args], {
    cwd: cliRoot,
    encoding: "utf8",
  });
}

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [`${path}:${statSync(path).size}`];
  }).sort();
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
    expect(result.stdout).toContain("Files scanned: 17");
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

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Atlas activation computed (structural component only).");
    expect(result.stdout).toContain("Objects scored: 13");
    expect(result.stdout).toContain(`Cached: ${vault}/.atlas/cache/activation.json`);
    expect(result.stdout).toContain("Ranking (structural_score):");
    expect(existsSync(cachePath)).toBe(true);
    expect(Object.keys(JSON.parse(readFileSync(cachePath, "utf8")).entries)).toHaveLength(13);
  });
});
