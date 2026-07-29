import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rootPackage = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
const cliPackage = JSON.parse(readFileSync(join(repositoryRoot, "tools", "atlas-cli", "package.json"), "utf8"));
const cliRoot = join(repositoryRoot, "tools", "atlas-cli");
const tsxCli = join(cliRoot, "node_modules", "tsx", "dist", "cli.mjs");

const rootDelegates = {
  setup: "npm ci --prefix tools/atlas-cli",
  test: "npm --prefix tools/atlas-cli run test --",
  typecheck: "npm --prefix tools/atlas-cli run typecheck --",
  "atlas:validate": "npm --prefix tools/atlas-cli run validate --",
  "atlas:id": "npm --prefix tools/atlas-cli run id --",
  "atlas:new": "npm --prefix tools/atlas-cli run new --",
  "atlas:index": "npm --prefix tools/atlas-cli run index --",
  "atlas:context": "npm --prefix tools/atlas-cli run context --",
  "atlas:activation": "npm --prefix tools/atlas-cli run activation --",
  "atlas:health": "npm --prefix tools/atlas-cli run health --",
};

const cliScripts = {
  typecheck: "tsc --noEmit -p tsconfig.json",
  validate: "tsx src/cli.ts validate ../../vault-prototype",
  id: "tsx src/cli.ts id",
  new: "tsx src/cli.ts new --vault ../../vault-prototype",
  index: "tsx src/cli.ts index ../../vault-prototype",
  context: "tsx scripts/context.ts",
  activation: "tsx src/cli.ts activation ../../vault-prototype",
  health: "npm run validate && npm run index && npm run activation",
};

describe("portable package scripts", () => {
  it("delegates every root command through npm without direct .bin paths", () => {
    expect(rootPackage.scripts).toMatchObject(rootDelegates);
    expect(Object.values(rootPackage.scripts).join("\n")).not.toContain(".bin");
  });

  it("keeps executable tooling and vault paths inside the nested CLI package", () => {
    expect(cliPackage.scripts).toMatchObject(cliScripts);
    expect(rootPackage.dependencies).toBeUndefined();
    expect(rootPackage.devDependencies).toBeUndefined();
    expect(existsSync(join(repositoryRoot, "package-lock.json"))).toBe(false);
    expect(existsSync(join(repositoryRoot, "tools", "atlas-cli", "package-lock.json"))).toBe(true);
  });
});

describe("cross-platform delivery contracts", () => {
  it("defines an Ubuntu and Windows Node 22 matrix with independent root checks", () => {
    const workflowPath = join(repositoryRoot, ".github", "workflows", "cross-platform.yml");
    expect(existsSync(workflowPath)).toBe(true);

    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("node-version: 22");
    for (const command of [
      "npm ci --prefix tools/atlas-cli",
      "npm test",
      "npm run typecheck",
      "npm run atlas:validate",
      "npm run atlas:index",
      "npm run atlas:activation",
      "npm run atlas:health",
    ]) {
      expect(workflow).toContain(`run: ${command}`);
    }
  });

  it("documents the Windows setup, verification, and diagnostics flow in Spanish", () => {
    const readme = readFileSync(join(repositoryRoot, "README.md"), "utf8");
    expect(readme).toContain("## Windows: instalación y verificación");
    for (const command of [
      "npm run setup",
      "npm test",
      "npm run typecheck",
      "npm run atlas:validate",
      "npm run atlas:index",
      "npm run atlas:activation",
      "npm run atlas:health",
    ]) {
      expect(readme).toContain(command);
    }
    expect(readme).toContain("Node.js o npm no están disponibles");
    expect(readme).toContain("no se instalaron las dependencias");
    expect(readme).toContain("lockfile");
  });
});

describe("context script", () => {
  it("runs the existing context command from the repository root", () => {
    const index = spawnSync(process.execPath, [tsxCli, "src/cli.ts", "index", "../../vault-prototype"], {
      cwd: cliRoot,
      encoding: "utf8",
    });
    expect(index.status).toBe(0);

    const context = spawnSync(process.execPath, [tsxCli, "scripts/context.ts", "context-engine"], {
      cwd: cliRoot,
      encoding: "utf8",
    });
    expect(context.status).toBe(0);
    expect(context.stdout).toContain("Context for: Context Engine");
  });
});
