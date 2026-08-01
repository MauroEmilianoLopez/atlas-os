// indexer.ts — orchestrates: validate -> parse -> build all index artifacts -> write.
// Reuses parser/validate/relations/task-log; does NOT duplicate validation logic.

import { parseFile, findMarkdown } from "./parser.js";
import { validateVault } from "./validate.js";
import { extractRelations } from "./relations.js";
import { collectTaskIds } from "./task-log.js";
import { commonFrontmatter, NON_KO_TYPES } from "./schemas.js";
import {
  buildGraph,
  relationKind,
  type IndexedObject,
  type IndexedRelation,
  type Graph,
} from "./graph.js";
import { buildKnowledgeIndex } from "./core/index.js";
import type { KnowledgeObject, Relation, TaskRecord } from "./core/contracts.js";
import { toLegacyRelations, writeIndexArtifacts } from "./adapters/index-json.js";
import { SystemClock } from "./adapters/system-clock.js";
import { FilesystemKnowledgeSource } from "./adapters/filesystem-source.js";
import { SCALAR_RELATIONS } from "./types.js";
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
/** True if a scalar relation value is "human" (or a list containing "human"). */
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

function pickCoreAttributes(fm: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const attributes: Record<string, unknown> = { ...fm };
  delete attributes.id;
  delete attributes.type;
  delete attributes.title;
  delete attributes.lifecycle;
  delete attributes.created;
  return attributes;
}

function toCoreRelation(relation: IndexedRelation): Relation {
  return {
    sourceId: relation.source_id,
    originalSourceId: relation.source_id,
    kind: relation.relation,
    targetId: relation.target_id,
    originalTargetId: relation.target_id,
    label: relation.target_label,
    derivesFrom: relation.deriva_de,
    writtenBy: relation.escrito_por,
    endorsedBy: relation.respaldado_por,
    validatedBy: relation.validado_por,
    traversalKind: relation.kind,
    sourcePath: relation.source_path,
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

  // 2. Parse all files (already known valid).
  const files = findMarkdown(vaultRoot);
  const objects: IndexedObject[] = [];
  const relations: IndexedRelation[] = [];
  const coreObjects: KnowledgeObject[] = [];
  const coreRelations: Relation[] = [];
  const idToPath: Record<string, string> = {};
  const pathToId: Record<string, string> = {};
  const typeCounts: Record<string, number> = {};
  const relCounts: Record<string, number> = {};

  const parsedFiles = files.map((f) => parseFile(f, vaultRoot));

  for (const p of parsedFiles) {
    if (!p.hasFrontmatter) continue;
    const fm = p.frontmatter;
    const type = asStr(fm.type);

    // Index relations for ALL frontmatter files (incl. non-KO maps), but only KO contract types
    // become objects in objects.json.
    const isNonKO = NON_KO_TYPES.has(type);

    if (!isNonKO) {
      const parsed = commonFrontmatter.safeParse(fm);
      if (parsed.success) {
        const ko = parsed.data;
        const obj: IndexedObject = {
          id: ko.id,
          type: ko.type,
          title: ko.title,
          lifecycle: ko.lifecycle,
          path: p.relPath,
          created: asStr(ko.created),
          tags: asArr(fm.tags),
          aliases: asArr(fm.aliases),
          endorsed_by_human: scalarHasHuman(fm.respaldado_por),
          validated_by_human: scalarHasHuman(fm.validado_por),
        };
        objects.push(obj);
        coreObjects.push({
          id: ko.id,
          type: ko.type,
          title: ko.title,
          lifecycle: ko.lifecycle,
          created: asStr(ko.created),
          attributes: {
            ...pickCoreAttributes(fm),
          },
          sourcePath: p.relPath,
        });
        idToPath[ko.id] = p.relPath;
        pathToId[p.relPath] = ko.id;
        typeCounts[ko.type] = (typeCounts[ko.type] ?? 0) + 1;
      }
    }

    // Extract strong typed relations (array + scalar forms).
    const sourceId = asStr(fm.id);
    const sourcePath = p.relPath;
    const { relations: rels } = extractRelations(fm);
    for (const r of rels) {
      if (!r.target_id) continue;
      const raw = (r.raw ?? {}) as Record<string, unknown>;
      const rel: IndexedRelation = {
        source_id: sourceId,
        source_path: sourcePath,
        relation: r.key,
        target_id: r.target_id,
        target_label: typeof raw.label === "string" ? raw.label : undefined,
        strength: "strong",
        kind: relationKind(r.key),
        deriva_de: Array.isArray(raw.deriva_de) ? raw.deriva_de.map(asStr) : undefined,
        escrito_por: typeof raw.escrito_por === "string" ? raw.escrito_por : undefined,
        respaldado_por: typeof raw.respaldado_por === "string" ? raw.respaldado_por : undefined,
        validado_por: typeof raw.validado_por === "string" ? raw.validado_por : undefined,
      };
      relations.push(rel);
      coreRelations.push(toCoreRelation(rel));
      relCounts[r.key] = (relCounts[r.key] ?? 0) + 1;
    }

    // Scalar relations (escrito_por/respaldado_por/validado_por) at top level also count as edges
    // to actors/agents when their value is an id (not "human"). They are recorded as relations too.
    for (const key of SCALAR_RELATIONS) {
      if (!(key in fm)) continue;
      const val = fm[key];
      const vals = Array.isArray(val) ? val : [val];
      for (const v of vals) {
        if (typeof v !== "string" || v === "human") continue;
        const rel: IndexedRelation = {
          source_id: sourceId,
          source_path: sourcePath,
          relation: key,
          target_id: v,
          strength: "strong",
          kind: relationKind(key),
        };
        relations.push(rel);
        coreRelations.push(toCoreRelation(rel));
        relCounts[key] = (relCounts[key] ?? 0) + 1;
      }
    }
  }

  // 3. Tasks index — from the task logs.
  const tasks = indexTasks(vaultRoot, parsedFiles);
  const coreTasks: TaskRecord[] = tasks.map((task) => ({
    id: task.id,
    status: task.status,
    createdAt: task.date,
    sourcePath: task.source_log,
  }));

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

  // 6. Write.
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
function indexTasks(
  vaultRoot: string,
  parsedFiles: { relPath: string; path: string; frontmatter: Record<string, unknown> }[],
): TaskIndexEntry[] {
  const out: TaskIndexEntry[] = [];
  const logFiles = parsedFiles.filter((p) => p.relPath.startsWith("execution/tasks/"));

  for (const lf of logFiles) {
    const raw = fs.readFileSync(lf.path, "utf-8");
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
          source_log: lf.relPath,
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
