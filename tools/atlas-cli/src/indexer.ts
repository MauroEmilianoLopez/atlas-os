// indexer.ts — orchestrates: validate -> build index artifacts -> write.
// Reuses validation, task-log parsing and the Core-backed filesystem source.

import { findMarkdown } from "./parser.js";
import { validateVault } from "./validate.js";
import {
  buildGraph,
  type IndexedObject,
  type IndexedRelation,
  type Graph,
} from "./graph.js";
import { buildKnowledgeIndex } from "./core/index.js";
import type { KnowledgeObject } from "./core/contracts.js";
import { toLegacyRelations, writeIndexArtifacts } from "./adapters/index-json.js";
import { SystemClock } from "./adapters/system-clock.js";
import { FilesystemKnowledgeSource } from "./adapters/filesystem-source.js";
import fs from "node:fs";
import path from "node:path";

export interface TaskIndexEntry {
  id: string;
  date: string | null;
  agent: string | null;
  status: string | null;
  source_log: string;
  produced: string[];
  cost: { tokens: number | null; duration_ms: number | null };
}

export interface IndexStats {
  generated_at: string;
  vault_path: string;
  files_scanned: number;
  knowledge_objects: number;
  relations: number;
  tasks: number;
  types: Record<string, number>;
  relations_by_type: Record<string, number>;
  warnings: string[];
  errors: string[];
}

export interface IndexResult {
  ok: boolean;
  reason?: string;
  objects: IndexedObject[];
  relations: IndexedRelation[];
  graph: Graph;
  tasks: TaskIndexEntry[];
  stats: IndexStats;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asStr) : [];
}

function scalarHasHuman(v: unknown): boolean {
  if (v === "human") return true;
  if (Array.isArray(v)) return v.includes("human");
  return false;
}

function toLegacyObject(object: KnowledgeObject): IndexedObject {
  const attributes = object.attributes as Record<string, unknown>;
  return {
    id: object.id,
    type: object.type,
    title: object.title,
    lifecycle: object.lifecycle,
    path: object.sourcePath ?? "",
    created: object.created,
    tags: asArr(attributes.tags),
    aliases: asArr(attributes.aliases),
    endorsed_by_human: scalarHasHuman(attributes.respaldado_por),
    validated_by_human: scalarHasHuman(attributes.validado_por),
  };
}

function countRelationsByType(relations: readonly IndexedRelation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const relation of relations) {
    counts[relation.relation] = (counts[relation.relation] ?? 0) + 1;
  }
  return counts;
}

function countTypes(objects: readonly IndexedObject[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const object of objects) {
    counts[object.type] = (counts[object.type] ?? 0) + 1;
  }
  return counts;
}

/** Build (and optionally write) the external index for a vault.
 *  Runs P1 validation first; if it fails, returns ok:false and writes nothing. */
export function buildIndex(
  vaultRoot: string,
  opts: { clean?: boolean; write?: boolean } = {},
): IndexResult {
  const write = opts.write ?? true;

  // 1. Validation gate — reuse P1. No index on invalid vault.
  const validation = validateVault(vaultRoot);
  if (!validation.ok) {
    return {
      ok: false,
      reason: "vault validation failed",
      objects: [],
      relations: [],
      graph: { nodes: {}, edges: {}, reverse_edges: {} },
      tasks: [],
      stats: emptyStats(vaultRoot),
    };
  }

  // 2. Parse only the legacy task logs we still materialize.
  const files = findMarkdown(vaultRoot);
  const tasks = indexTasks(vaultRoot, files);

  const snapshot = new FilesystemKnowledgeSource(vaultRoot).load();
  const coreResult = buildKnowledgeIndex({ load: () => snapshot }, new SystemClock());
  if (!coreResult.ok) {
    return {
      ok: false,
      reason: coreResult.error.message,
      objects: [],
      relations: [],
      graph: { nodes: {}, edges: {}, reverse_edges: {} },
      tasks: [],
      stats: emptyStats(vaultRoot),
    };
  }

  const legacyObjects = snapshot.objects.map(toLegacyObject);
  const legacyRelations = toLegacyRelations(coreResult.value.relationRecords ?? coreResult.value.relations);
  const graph = buildGraph(legacyObjects, legacyRelations);
  const stats: IndexStats = {
    generated_at: coreResult.value.generatedAt,
    vault_path: path.basename(vaultRoot),
    files_scanned: snapshot.validation?.filesScanned ?? files.length,
    knowledge_objects: legacyObjects.length,
    relations: legacyRelations.length,
    tasks: tasks.length,
    types: countTypes(legacyObjects),
    relations_by_type: countRelationsByType(legacyRelations),
    warnings: validation.warnings.map((w) => `${w.file}: ${w.message}`),
    errors: [],
  };

  if (write) {
    writeIndexArtifacts(vaultRoot, coreResult.value, {
      clean: opts.clean,
      tasks,
      stats,
    });
  }

  return {
    ok: true,
    objects: legacyObjects,
    relations: legacyRelations,
    graph,
    tasks,
    stats,
  };
}

/** Parse task log YAML blocks into a flat task index. Tasks are entries, not files (RFC-002 §8). */
function indexTasks(vaultRoot: string, files: string[]): TaskIndexEntry[] {
  const out: TaskIndexEntry[] = [];
  const logFiles = files.filter((file) =>
    path.relative(vaultRoot, file).split(path.sep).join("/").startsWith("execution/tasks/"),
  );

  for (const lf of logFiles) {
    const relPath = path.relative(vaultRoot, lf).split(path.sep).join("/");
    const raw = fs.readFileSync(lf, "utf-8");
    // Task entries live in ```yaml fenced blocks as a list of `- id: task_...` objects.
    const blocks = [...raw.matchAll(/```yaml\s*([\s\S]*?)```/g)].map((m) => m[1]);
    for (const block of blocks) {
      // naive but sufficient field extraction per entry (split on top-level "- id:")
      const entries = block.split(/\n(?=- id:)/g);
      for (const e of entries) {
        const idM = e.match(/id:\s*(task_[A-Za-z0-9]+)/);
        if (!idM) continue;
        out.push({
          id: idM[1],
          date: pick(e, /(?:created|date):\s*([0-9T:\-Z.]+)/)?.slice(0, 10) ?? null,
          agent: pick(e, /ejecutado_por:\s*([A-Za-z0-9_]+)/) ?? null,
          status: pick(e, /estado:\s*([A-Za-z_]+)/) ?? null,
          source_log: relPath,
          produced: [...e.matchAll(/produjo:\s*(ko_[A-Za-z0-9]+)/g)].map((m) => m[1]),
          cost: {
            tokens: numOrNull(pick(e, /tokens:\s*([0-9]+)/)),
            duration_ms: null,
          },
        });
      }
    }
  }
  return out;
}

function pick(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}

function numOrNull(s: string | null): number | null {
  return s == null ? null : Number(s);
}

function emptyStats(vaultRoot: string): IndexStats {
  return {
    generated_at: new Date().toISOString(),
    vault_path: path.basename(vaultRoot),
    files_scanned: 0,
    knowledge_objects: 0,
    relations: 0,
    tasks: 0,
    types: {},
    relations_by_type: {},
    warnings: [],
    errors: ["vault validation failed"],
  };
}
