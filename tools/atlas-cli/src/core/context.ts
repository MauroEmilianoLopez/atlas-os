import type {
  AtlasIndex,
  ContextNode,
  ContextQuery,
  ContextRelation,
  ContextResult,
  CoreResult,
  Relation,
  RelationTraversalKind,
} from "./contracts.js";
import { InvalidArgumentError, ReferenceNotFoundError } from "./errors.js";

const DEFAULT_HOPS = 2;
const DEFAULT_BUDGET = 20;

interface NormalizedContextQuery {
  readonly seedId: string;
  readonly hops: number;
  readonly budget: number;
  readonly direction: "out" | "in" | "both";
  readonly coreOnly: boolean;
  readonly rank?: Readonly<Record<string, number>>;
}

interface TraversalCandidate {
  readonly relation: ContextRelation;
  readonly targetId: string;
}

export function assembleContext(index: AtlasIndex, query: ContextQuery): CoreResult<ContextResult> {
  const optionsResult = normalizeQuery(query);
  if (!optionsResult.ok) return optionsResult;

  const { seedId, hops, budget, direction, coreOnly, rank } = optionsResult.value;
  const objectsById = new Map(index.objects.map((object) => [object.id, object]));
  if (!objectsById.has(seedId)) {
    return { ok: false, error: new ReferenceNotFoundError(seedId) };
  }

  const visited = new Map<string, ContextNode>();
  visited.set(seedId, toContextNode(objectsById.get(seedId)!, 0, rank));
  const frontier = [{ id: seedId, depth: 0 }];
  const traversed = new Map<string, ContextRelation>();
  let truncated = false;

  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    const current = frontier[cursor];
    if (current.depth >= hops) continue;

    for (const candidate of neighborsOf(index, current.id, optionsResult.value)) {
      const edgeKey = `${candidate.relation.sourceId}|${candidate.relation.kind}|${candidate.relation.targetId}|${candidate.relation.direction}`;
      traversed.set(edgeKey, candidate.relation);
      if (visited.has(candidate.targetId)) continue;
      if (visited.size >= budget) {
        truncated = true;
        continue;
      }

      const object = objectsById.get(candidate.targetId);
      if (!object) continue;
      visited.set(candidate.targetId, toContextNode(object, current.depth + 1, rank));
      frontier.push({ id: candidate.targetId, depth: current.depth + 1 });
    }
  }

  return {
    ok: true,
    value: {
      seedId,
      hops,
      budget,
      direction,
      coreOnly,
      ranked: rank !== undefined,
      nodes: [...visited.values()].sort(compareNodes),
      relations: [...traversed.values()]
        .filter((relation) => visited.has(relation.sourceId) && visited.has(relation.targetId))
        .sort(compareRelations),
      truncated,
    },
  };
}

function normalizeQuery(query: ContextQuery): CoreResult<NormalizedContextQuery> {
  if (typeof query.seedId !== "string" || query.seedId.trim().length === 0) {
    return { ok: false, error: new InvalidArgumentError("seedId", "seedId must be a non-empty string") };
  }

  const hops = query.hops ?? DEFAULT_HOPS;
  if (!Number.isInteger(hops) || hops < 0) {
    return { ok: false, error: new InvalidArgumentError("hops", "hops must be a non-negative integer") };
  }

  const budget = query.budget ?? DEFAULT_BUDGET;
  if (!Number.isInteger(budget) || budget < 1) {
    return { ok: false, error: new InvalidArgumentError("budget", "budget must be a positive integer") };
  }

  const direction = query.direction ?? "both";
  if (direction !== "out" && direction !== "in" && direction !== "both") {
    return { ok: false, error: new InvalidArgumentError("direction", "direction must be out, in, or both") };
  }

  if (query.rank !== undefined && Object.values(query.rank).some((score) => !Number.isFinite(score))) {
    return { ok: false, error: new InvalidArgumentError("rank", "rank scores must be finite numbers") };
  }

  return {
    ok: true,
    value: {
      seedId: query.seedId,
      hops,
      budget,
      direction,
      coreOnly: query.coreOnly ?? false,
      rank: query.rank,
    },
  };
}

function neighborsOf(index: AtlasIndex, nodeId: string, query: NormalizedContextQuery): readonly TraversalCandidate[] {
  const candidates: TraversalCandidate[] = [];

  if (query.direction === "out" || query.direction === "both") {
    for (const relation of index.relations) {
      if (relation.sourceId !== nodeId || !shouldTraverse(relation, query.coreOnly)) continue;
      candidates.push({
        targetId: relation.targetId,
        relation: toContextRelation(relation, "out"),
      });
    }
  }

  if (query.direction === "in" || query.direction === "both") {
    for (const relation of index.relations) {
      if (relation.targetId !== nodeId || !shouldTraverse(relation, query.coreOnly)) continue;
      candidates.push({
        targetId: relation.sourceId,
        relation: toContextRelation(relation, "in"),
      });
    }
  }

  return candidates.sort((left, right) => compareCandidates(left, right, query.rank));
}

function shouldTraverse(relation: Relation, coreOnly: boolean): boolean {
  return !coreOnly || relationTraversalKind(relation) === "core";
}

function toContextNode(object: AtlasIndex["objects"][number], depth: number, rank?: Readonly<Record<string, number>>): ContextNode {
  return {
    id: object.id,
    type: object.type,
    title: object.title,
    sourcePath: object.sourcePath,
    depth,
    rank: rank?.[object.id] ?? 0,
  };
}

function toContextRelation(relation: Relation, direction: "out" | "in"): ContextRelation {
  return {
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    kind: relation.kind,
    traversalKind: relationTraversalKind(relation),
    direction,
    label: relation.label,
  };
}

function relationTraversalKind(relation: Relation): RelationTraversalKind {
  return relation.traversalKind ?? "core";
}

function compareCandidates(
  left: TraversalCandidate,
  right: TraversalCandidate,
  rank?: Readonly<Record<string, number>>,
): number {
  if (left.relation.traversalKind !== right.relation.traversalKind) {
    return left.relation.traversalKind === "core" ? -1 : 1;
  }

  const rankDifference = (rank?.[right.targetId] ?? 0) - (rank?.[left.targetId] ?? 0);
  if (rankDifference !== 0) return rankDifference;

  return left.targetId.localeCompare(right.targetId)
    || left.relation.kind.localeCompare(right.relation.kind)
    || left.relation.direction.localeCompare(right.relation.direction);
}

function compareNodes(left: ContextNode, right: ContextNode): number {
  return left.depth - right.depth || left.id.localeCompare(right.id);
}

function compareRelations(left: ContextRelation, right: ContextRelation): number {
  return left.sourceId.localeCompare(right.sourceId)
    || left.kind.localeCompare(right.kind)
    || left.targetId.localeCompare(right.targetId)
    || left.direction.localeCompare(right.direction);
}
