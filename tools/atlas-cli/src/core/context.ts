import type { AtlasIndex, ContextQuery, ContextResult, CoreResult } from "./contracts.js";
import { InvalidArgumentError, ReferenceNotFoundError } from "./errors.js";

const DEFAULT_HOPS = 2;
const DEFAULT_BUDGET = 20;

export function assembleContext(index: AtlasIndex, query: ContextQuery): CoreResult<ContextResult> {
  const optionsResult = normalizeQuery(query);
  if (!optionsResult.ok) return optionsResult;

  const { seedId, hops, budget, direction } = optionsResult.value;
  const objectsById = new Map(index.objects.map((object) => [object.id, object]));
  if (!objectsById.has(seedId)) {
    return { ok: false, error: new ReferenceNotFoundError(seedId) };
  }

  const visited = new Set<string>([seedId]);
  const nodeIds = [seedId];
  const frontier = [{ id: seedId, depth: 0 }];
  let truncated = false;

  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    const current = frontier[cursor];
    if (current.depth >= hops) continue;

    for (const neighbor of neighborsOf(index, current.id, direction)) {
      if (visited.has(neighbor)) continue;
      if (visited.size >= budget) {
        truncated = true;
        continue;
      }
      if (!objectsById.has(neighbor)) continue;

      visited.add(neighbor);
      nodeIds.push(neighbor);
      frontier.push({ id: neighbor, depth: current.depth + 1 });
    }
  }

  return {
    ok: true,
    value: {
      seedId,
      nodes: nodeIds.map((id) => objectsById.get(id)!),
      relations: index.relations
        .filter((relation) => visited.has(relation.sourceId) && visited.has(relation.targetId))
        .slice()
        .sort(compareRelations),
      truncated,
    },
  };
}

function normalizeQuery(query: ContextQuery): CoreResult<Required<ContextQuery>> {
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

  return { ok: true, value: { seedId: query.seedId, hops, budget, direction } };
}

function neighborsOf(index: AtlasIndex, nodeId: string, direction: Required<ContextQuery>["direction"]): readonly string[] {
  const neighbors = new Set<string>();
  if (direction === "out" || direction === "both") {
    for (const targetId of index.graph.edges[nodeId] ?? []) neighbors.add(targetId);
  }
  if (direction === "in" || direction === "both") {
    for (const sourceId of index.graph.reverseEdges[nodeId] ?? []) neighbors.add(sourceId);
  }
  return [...neighbors].sort((left, right) => left.localeCompare(right));
}

function compareRelations(
  left: AtlasIndex["relations"][number],
  right: AtlasIndex["relations"][number],
): number {
  return left.sourceId.localeCompare(right.sourceId)
    || left.kind.localeCompare(right.kind)
    || left.targetId.localeCompare(right.targetId)
    || (left.label ?? "").localeCompare(right.label ?? "");
}
