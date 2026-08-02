#!/usr/bin/env tsx
// cli.ts — command-line entrypoint. Commands: validate, id, new.

import path from "node:path";
import fs from "node:fs";
import process from "node:process";
import { Command } from "commander";
import { runValidateCommand } from "./cli-validate.js";
import { generateId } from "./id.js";
import { createKO } from "./generator.js";
import { buildIndex } from "./indexer.js";
import { resolveSeed, loadCoreIndex, renderContextResult, CoreIndexNotBuiltError } from "./adapters/index-json.js";
import { assembleContext } from "./core/context.js";
import { runActivation, type ActivationEntry } from "./activation.js";
import { SystemClock } from "./adapters/system-clock.js";
import { ID_PREFIX } from "./types.js";

const program = new Command();
program
  .name("atlas")
  .description("Atlas Validator & Generator (P1)")
  .version("0.1.0");

function parseContextHops(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.ceil(parsed) : -1;
}

function parseContextBudget(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.ceil(parsed)) : 20;
}

// --- validate ---
program
  .command("validate")
  .argument("[vault]", "path to the vault root", "vault-prototype")
  .description("Validate all Knowledge Objects, relations and task references in a vault")
  .action((vault: string) => {
    const root = path.resolve(process.cwd(), vault);
    process.exit(runValidateCommand(root, console.log));
  });

// --- id ---
program
  .command("id")
  .description("Generate a new stable Atlas ID for a type")
  .requiredOption("--type <type>", "KO type (concept, insight, agent, task, policy, ...)")
  .action((opts: { type: string }) => {
    if (!ID_PREFIX[opts.type]) {
      console.error(`Unknown type "${opts.type}". Known: ${Object.keys(ID_PREFIX).join(", ")}`);
      process.exit(1);
    }
    console.log(generateId(opts.type));
  });

// --- new ---
program
  .command("new")
  .description("Create a new minimal Knowledge Object from a template")
  .requiredOption("--type <type>", "KO type")
  .requiredOption("--title <title>", "human-readable title")
  .option("--vault <path>", "vault root", "vault-prototype")
  .option("--date <date>", "YYYY-MM-DD (defaults to today)")
  .option("--force", "overwrite if the file already exists", false)
  .action((opts: { type: string; title: string; vault: string; date?: string; force: boolean }) => {
    const root = path.resolve(process.cwd(), opts.vault);
    try {
      const res = createKO(root, { type: opts.type, title: opts.title, date: opts.date }, opts.force);
      if (!res.created) {
        console.error(`File already exists: ${res.relPath} (use --force to overwrite)`);
        process.exit(1);
      }
      console.log(`Created ${res.relPath}`);
      console.log(`id: ${res.id}`);
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }
  });

// --- index ---
program
  .command("index")
  .argument("[vault]", "path to the vault root", "vault-prototype")
  .option("--clean", "remove the previous index before rebuilding", false)
  .description("Build the external regenerable index under .atlas/index/ (validates first)")
  .action((vault: string, opts: { clean: boolean }) => {
    const root = path.resolve(process.cwd(), vault);
    const r = buildIndex(root, { clean: opts.clean, write: true });

    if (!r.ok) {
      console.log("Atlas index failed.");
      console.log(`Reason: ${r.reason}.`);
      console.log("Run npm run atlas:validate for details.");
      process.exit(1);
    }

    console.log("Atlas index generated.");
    console.log(`Objects: ${r.objects.length}`);
    console.log(`Relations: ${r.relations.length}`);
    console.log(`Tasks: ${r.tasks.length}`);
    console.log(`Output: ${vault}/.atlas/index/`);
    process.exit(0);
  });

// --- context ---
program
  .command("context")
  .argument("<seed>", "seed reference: an id, a file slug, a path, or a title")
  .argument("[vault]", "path to the vault root", "vault-prototype")
  .option("--hops <n>", "max traversal depth", "2")
  .option("--budget <n>", "max nodes in the assembled context", "20")
  .option("--direction <dir>", "out | in | both", "both")
  .option("--core-only", "traverse only core-kind edges", false)
  .option("--rank", "rank neighbors by cached activation score under budget", false)
  .option("--json", "output the raw context subgraph as JSON", false)
  .description("Assemble the minimal context subgraph around a seed (Context Engine v0)")
  .action((seed: string, vault: string, opts: { hops: string; budget: string; direction: string; coreOnly: boolean; rank: boolean; json: boolean }) => {
    const root = path.resolve(process.cwd(), vault);
    let idx;
    try {
      idx = loadCoreIndex(root);
    } catch (e) {
      if (e instanceof CoreIndexNotBuiltError) {
        console.error(e.message);
        process.exit(1);
      }
      throw e;
    }

    const seedId = resolveSeed(idx, seed);
    if (!seedId) {
      console.error(`Could not resolve seed "${seed}" to any Knowledge Object.`);
      process.exit(1);
    }

    const dir = opts.direction as "out" | "in" | "both";
    if (!["out", "in", "both"].includes(dir)) {
      console.error(`Invalid --direction "${opts.direction}" (use out | in | both)`);
      process.exit(1);
    }

    // Optional activation ranking (P4): read the cached scores if --rank and cache exists.
    let activation: Record<string, number> | undefined;
    if (opts.rank) {
      const cachePath = path.join(root, ".atlas", "cache", "activation.json");
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        activation = Object.fromEntries(
          Object.values(cache.entries as Record<string, { id: string; structural_score: number }>).map(
            (e) => [e.id, e.structural_score],
          ),
        );
      } else {
        console.error("--rank requested but no activation cache found. Run: npm run atlas:activation");
        process.exit(1);
      }
    }

    const ctx = assembleContext(idx, {
      seedId,
      hops: parseContextHops(opts.hops),
      budget: parseContextBudget(opts.budget),
      direction: dir,
      coreOnly: opts.coreOnly,
      rank: activation,
    });

    if (!ctx.ok) {
      console.error(ctx.error.message);
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(ctx.value, null, 2));
    } else {
      console.log(renderContextResult(idx, ctx.value));
    }
    process.exit(0);
  });

// --- activation ---
program
  .command("activation")
  .argument("[vault]", "path to the vault root", "vault-prototype")
  .option("--json", "output the full activation result as JSON", false)
  .option("--band <band>", "filter listing to a band: ACTIVO | REACTIVABLE | FRIO")
  .description("Compute structural activation for every KO and cache it (Activation v0)")
  .action((vault: string, opts: { json: boolean; band?: string }) => {
    const root = path.resolve(process.cwd(), vault);
    try {
      const result = runActivation(root, { clock: new SystemClock() });

      if (!result.ok) {
        console.error(result.error.message);
        process.exit(1);
      }

      const activation = result.value;

      if (opts.json) {
        console.log(JSON.stringify(activation, null, 2));
        process.exit(0);
      }

      console.log("Atlas activation computed (structural component only).");
      console.log(`Objects scored: ${Object.keys(activation.entries).length}`);
      console.log(`Bands — ACTIVO: ${activation.bands.ACTIVO}  REACTIVABLE: ${activation.bands.REACTIVABLE}  FRIO: ${activation.bands.FRIO}`);
      console.log(`Cached: ${vault}/.atlas/cache/activation.json`);
      console.log("");

      const entries = Object.values(activation.entries)
        .filter((e: ActivationEntry) => !opts.band || e.band === opts.band)
        .sort((a: ActivationEntry, b: ActivationEntry) => b.structural_score - a.structural_score);

      console.log("Ranking (structural_score):");
      for (const e of entries) {
        console.log(`  ${String(e.structural_score).padStart(3)}  [${e.band.padEnd(11)}] ${e.type}: ${e.title}`);
      }
      process.exit(0);
    } catch (e) {
      if (e instanceof CoreIndexNotBuiltError) {
        console.error(e.message);
        process.exit(1);
      }
      throw e;
    }
  });

program.parseAsync(process.argv);
