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
