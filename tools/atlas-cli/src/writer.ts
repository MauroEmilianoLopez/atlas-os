// writer.ts — write/clean the external index under .atlas/index/. Pure filesystem side-effects.

import fs from "node:fs";
import path from "node:path";

export const INDEX_FILES = [
  "index.json",
  "objects.json",
  "id-path.json",
  "path-id.json",
  "relations.json",
  "graph.json",
  "tasks.json",
  "stats.json",
] as const;

export function indexDir(vaultRoot: string): string {
  return path.join(vaultRoot, ".atlas", "index");
}

export function cacheDir(vaultRoot: string): string {
  return path.join(vaultRoot, ".atlas", "cache");
}

/** Write a JSON file into .atlas/cache/ (derived, regenerable, not versioned). */
export function writeCache(vaultRoot: string, filename: string, data: unknown): void {
  const dir = cacheDir(vaultRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Remove all known index JSON files (used by --clean). Leaves the directory and its README/.gitkeep. */
export function cleanIndex(vaultRoot: string): void {
  const dir = indexDir(vaultRoot);
  if (!fs.existsSync(dir)) return;
  for (const f of INDEX_FILES) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

/** Write a single JSON file (pretty-printed, newline-terminated). */
export function writeJson(vaultRoot: string, filename: string, data: unknown): void {
  const dir = indexDir(vaultRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2) + "\n", "utf-8");
}
