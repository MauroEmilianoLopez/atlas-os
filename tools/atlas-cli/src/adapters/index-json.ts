import fs from "node:fs";
import path from "node:path";
import type {
  AtlasIndex,
  ContextResult,
  KnowledgeObject,
  Relation,
  RelationRecord,
} from "../core/contracts.js";
import { buildGraph, type IndexedObject, type IndexedRelation } from "../graph.js";
import { indexDir, writeJson, cleanIndex } from "../writer.js";
import { loadIndex, type LoadedIndex } from "../index-loader.js";

export class CoreIndexNotBuiltError extends Error {
  constructor(dir: string) {
    super(`No index found at ${dir}. Run: npm run atlas:index`);
    this.name = "CoreIndexNotBuiltError";
  }
}

export interface LegacyTaskIndexEntry {
  id: string;
  date: string | null;
  agent: string | null;
  status: string | null;
  source_log: string;
  produced: string[];
  cost: { tokens: number | null; duration_ms: number | null };
}

export interface LegacyIndexStats {
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

export function writeIndexArtifacts(
  vaultRoot: string,
  index: AtlasIndex,
  extras: { tasks: readonly LegacyTaskIndexEntry[]; stats: LegacyIndexStats; clean?: boolean },
): void {
  if (extras.clean) cleanIndex(vaultRoot);

  const legacyObjects = index.objects.map(toLegacyObject);
  const legacyRelations = toLegacyRelations(index.relationRecords ?? index.relations);
  const graph = buildGraph(legacyObjects, legacyRelations);
  const idPath = Object.fromEntries(legacyObjects.map((object) => [object.id, object.path]));
  const pathId = Object.fromEntries(legacyObjects.map((object) => [object.path, object.id]));

  writeJson(vaultRoot, "index.json", index);
  writeJson(vaultRoot, "objects.json", legacyObjects);
  writeJson(vaultRoot, "id-path.json", idPath);
  writeJson(vaultRoot, "path-id.json", pathId);
  writeJson(vaultRoot, "relations.json", legacyRelations);
  writeJson(vaultRoot, "graph.json", graph);
  writeJson(vaultRoot, "tasks.json", extras.tasks);
  writeJson(vaultRoot, "stats.json", extras.stats);
}

export function loadCoreIndex(vaultRoot: string): AtlasIndex {
  const coreIndexPath = path.join(indexDir(vaultRoot), "index.json");
  if (fs.existsSync(coreIndexPath)) {
    return loadTraversalIndex(JSON.parse(fs.readFileSync(coreIndexPath, "utf-8")) as AtlasIndex);
  }

  try {
    return loadTraversalIndex(legacyToCoreIndex(loadIndex(vaultRoot)));
  } catch {
    throw new CoreIndexNotBuiltError(indexDir(vaultRoot));
  }
}

export function resolveSeed(index: AtlasIndex, ref: string): string | null {
  if (index.graph.nodes[ref]) return ref;

  const byPath = index.objects.find((object) => object.sourcePath === ref);
  if (byPath) return byPath.id;

  const bySlug = index.objects.find((object) => {
    const base = object.sourcePath?.split("/").pop() ?? "";
    return base.replace(/\.md$/, "") === ref;
  });
  if (bySlug) return bySlug.id;

  const byTitle = index.objects.find((object) => object.title.toLowerCase() === ref.toLowerCase());
  return byTitle?.id ?? null;
}

export function renderContextResult(index: AtlasIndex, ctx: ContextResult): string {
  const lines: string[] = [];
  const seed = ctx.nodes.find((node) => node.id === ctx.seedId);

  lines.push(`Context for: ${seed ? seed.title : ctx.seedId}  (${ctx.seedId})`);
  lines.push(`hops=${ctx.hops} budget=${ctx.budget} direction=${ctx.direction}${ctx.truncated ? "  [TRUNCATED by budget]" : ""}`);
  lines.push("");
  lines.push(`Nodes (${ctx.nodes.length}):`);
  for (const node of ctx.nodes) {
    const indent = "  ".repeat(node.depth);
    lines.push(`  ${indent}[d${node.depth}] ${node.type}: ${node.title}  (${node.sourcePath ?? ""})`);
  }
  lines.push("");
  lines.push(`Edges (${ctx.relations.length}):`);
  const nameOf = (id: string) => index.objects.find((object) => object.id === id)?.title ?? id;
  for (const relation of ctx.relations) {
    const arrow = relation.direction === "out" ? "->" : "<-";
    lines.push(`  ${nameOf(relation.sourceId)} --${relation.kind}${arrow}-- ${nameOf(relation.targetId)}  [${relation.traversalKind}]`);
  }

  return lines.join("\n");
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
    tags: asStringArray(attributes.tags),
    aliases: asStringArray(attributes.aliases),
    endorsed_by_human: isHuman(attributes.respaldado_por),
    validated_by_human: isHuman(attributes.validado_por),
  };
}

export function toLegacyRelations(relations: readonly RelationRecord[] | readonly Relation[]): IndexedRelation[] {
  return relations.map((relation) => {
    if ("relation" in relation) {
      return {
        source_id: relation.sourceId,
        source_path: relation.sourcePath ?? "",
        relation: relation.relation,
        target_id: relation.targetId,
        target_label: relation.targetLabel,
        strength: relation.strength,
        kind: relation.kind,
        deriva_de: relation.derivesFrom ? [...relation.derivesFrom] : undefined,
        escrito_por: relation.writtenBy,
        respaldado_por: relation.endorsedBy,
        validado_por: relation.validatedBy,
      };
    }

  return {
    source_id: relation.originalSourceId ?? relation.sourceId,
    source_path: relation.sourcePath ?? "",
    relation: relation.kind,
      target_id: relation.originalTargetId ?? relation.targetId,
      target_label: relation.label,
      strength: "strong",
      kind: relation.traversalKind ?? "core",
      deriva_de: relation.derivesFrom ? [...relation.derivesFrom] : undefined,
      escrito_por: relation.writtenBy,
      respaldado_por: relation.endorsedBy,
      validado_por: relation.validatedBy,
    };
  });
}

function legacyToCoreIndex(index: LoadedIndex): AtlasIndex {
  const objects = index.objects.map((object) => ({
    id: object.id,
    type: object.type,
    title: object.title,
    lifecycle: object.lifecycle as "fleeting" | "living" | "archived",
    created: object.created,
    attributes: {
      tags: object.tags,
      aliases: object.aliases,
      endorsed_by_human: object.endorsed_by_human ?? false,
      validated_by_human: object.validated_by_human ?? false,
    },
    sourcePath: object.path,
  }));

  const relations = index.relations.map((relation) => ({
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
  }));

  return {
    objects,
    relations,
    relationRecords: relations.map((relation) => ({
      sourceId: relation.originalSourceId ?? relation.sourceId,
      ...(relation.sourcePath === undefined ? {} : { sourcePath: relation.sourcePath }),
      relation: relation.kind,
      targetId: relation.originalTargetId ?? relation.targetId,
      ...(relation.label === undefined ? {} : { targetLabel: relation.label }),
      strength: "strong",
      kind: relation.traversalKind ?? "core",
      ...(relation.derivesFrom === undefined ? {} : { derivesFrom: relation.derivesFrom }),
      ...(relation.writtenBy === undefined ? {} : { writtenBy: relation.writtenBy }),
      ...(relation.endorsedBy === undefined ? {} : { endorsedBy: relation.endorsedBy }),
      ...(relation.validatedBy === undefined ? {} : { validatedBy: relation.validatedBy }),
    })),
    graph: legacyGraphToCore(index.graph),
    tasks: [],
    stats: {
      objects: objects.length,
      relations: relations.length,
      tasks: 0,
      types: countTypes(objects),
    },
    generatedAt: new Date().toISOString(),
  };
}

function legacyGraphToCore(index: LoadedIndex["graph"]): AtlasIndex["graph"] {
  const nodes = Object.fromEntries(
    Object.values(index.nodes).map((node) => [node.id, node.id]),
  );
  const edges = Object.fromEntries(
    Object.entries(index.edges).map(([id, outgoing]) => [id, outgoing.map((edge) => edge.target_id)]),
  );
  const reverseEdges = Object.fromEntries(
    Object.entries(index.reverse_edges).map(([id, incoming]) => [id, incoming.map((edge) => edge.source_id)]),
  );

  return { nodes, edges, reverseEdges };
}

function loadTraversalIndex(index: AtlasIndex): AtlasIndex {
  return {
    ...index,
    relations: index.relations.map((relation) => ({
      ...relation,
      sourceId: relation.originalSourceId ?? relation.sourceId,
      targetId: relation.originalTargetId ?? relation.targetId,
    })),
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function isHuman(value: unknown): boolean {
  if (value === "human") return true;
  return Array.isArray(value) && value.includes("human");
}

function countTypes(objects: readonly KnowledgeObject[]): Record<string, number> {
  const types: Record<string, number> = {};
  for (const object of objects) {
    types[object.type] = (types[object.type] ?? 0) + 1;
  }
  return types;
}
