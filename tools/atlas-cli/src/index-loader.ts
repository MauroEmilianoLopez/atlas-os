// index-loader.ts — read the pre-built external index from .atlas/index/ (never re-parses Markdown).
// The Context Engine works on top of this; if the index is missing it tells the caller to build it.

import fs from "node:fs";
import path from "node:path";
import type { Graph } from "./graph.js";
import type { IndexedObject, IndexedRelation } from "./graph.js";
import { indexDir } from "./writer.js";

export interface LoadedIndex {
  objects: IndexedObject[];
  graph: Graph;
  relations: IndexedRelation[];
  idPath: Record<string, string>;
}

export class IndexNotBuiltError extends Error {
  constructor(dir: string) {
    super(`No index found at ${dir}. Run: npm run atlas:index`);
    this.name = "IndexNotBuiltError";
  }
}

function readJson<T>(dir: string, file: string): T {
  const p = path.join(dir, file);
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

export function loadIndex(vaultRoot: string): LoadedIndex {
  const dir = indexDir(vaultRoot);
  if (!fs.existsSync(path.join(dir, "graph.json"))) {
    throw new IndexNotBuiltError(dir);
  }
  return {
    objects: readJson<IndexedObject[]>(dir, "objects.json"),
    graph: readJson<Graph>(dir, "graph.json"),
    relations: readJson<IndexedRelation[]>(dir, "relations.json"),
    idPath: readJson<Record<string, string>>(dir, "id-path.json"),
  };
}

/** Resolve a seed reference (id, path slug, or title) to a node id present in the graph. */
export function resolveSeed(idx: LoadedIndex, ref: string): string | null {
  // 1. exact id
  if (idx.graph.nodes[ref]) return ref;
  // 2. exact path
  for (const o of idx.objects) {
    if (o.path === ref) return o.id;
  }
  // 3. slug of the filename (e.g. "context-engine")
  const bySlug = idx.objects.find((o) => {
    const base = o.path.split("/").pop() ?? "";
    return base.replace(/\.md$/, "") === ref;
  });
  if (bySlug) return bySlug.id;
  // 4. case-insensitive title match
  const byTitle = idx.objects.find(
    (o) => o.title.toLowerCase() === ref.toLowerCase(),
  );
  if (byTitle) return byTitle.id;
  return null;
}
