// generator.ts — write new KOs to disk (used by `atlas new`).

import fs from "node:fs";
import path from "node:path";
import { renderKO, folderFor, filenameFor, type NewKOOptions } from "./templates.js";

export interface GenerateResult {
  id: string;
  relPath: string;
  absPath: string;
  created: boolean;
}

/** Create a new minimal KO under the vault. Will not overwrite unless force=true. */
export function createKO(
  vaultRoot: string,
  opts: NewKOOptions,
  force = false,
): GenerateResult {
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const folder = folderFor(opts.type);
  const filename = filenameFor(opts.type, opts.title, date);
  const relPath = `${folder}/${filename}`;
  const absDir = path.join(vaultRoot, folder);
  const absPath = path.join(absDir, filename);

  const { id, content } = renderKO({ ...opts, date });

  if (fs.existsSync(absPath) && !force) {
    return { id, relPath, absPath, created: false };
  }
  fs.mkdirSync(absDir, { recursive: true });
  fs.writeFileSync(absPath, content, "utf-8");
  return { id, relPath, absPath, created: true };
}
