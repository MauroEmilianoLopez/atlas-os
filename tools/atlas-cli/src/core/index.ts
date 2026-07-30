import type {
  AtlasGraph,
  AtlasIndex,
  AtlasIndexStats,
  CoreResult,
  KnowledgeSnapshot,
} from "./contracts.js";
import { AtlasCoreError, ExternalCapabilityError, SourceUnavailableError, ValidationFailedError } from "./errors.js";
import type { ClockPort, KnowledgeSourcePort } from "./ports.js";
import { validateKnowledgeBase } from "./validate.js";

export function buildKnowledgeIndex(source: KnowledgeSourcePort, clock: ClockPort): CoreResult<AtlasIndex> {
  const snapshotResult = loadSnapshot(source);
  if (!snapshotResult.ok) return snapshotResult;

  const report = validateKnowledgeBase({ load: () => snapshotResult.value });
  if (!report.ok) {
    return { ok: false, error: new ValidationFailedError(report) };
  }

  const generatedAtResult = readClock(clock);
  if (!generatedAtResult.ok) return generatedAtResult;

  const snapshot = snapshotResult.value;
  return {
    ok: true,
    value: {
      objects: snapshot.objects,
      relations: snapshot.relations,
      graph: buildGraph(snapshot),
      tasks: snapshot.tasks,
      stats: buildStats(snapshot),
      generatedAt: generatedAtResult.value,
    },
  };
}

function loadSnapshot(source: KnowledgeSourcePort): CoreResult<KnowledgeSnapshot> {
  try {
    return { ok: true, value: source.load() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof AtlasCoreError
        ? error
        : new SourceUnavailableError("Knowledge source is unavailable", error),
    };
  }
}

function readClock(clock: ClockPort): CoreResult<string> {
  try {
    return { ok: true, value: clock.now() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ExternalCapabilityError
        ? error
        : new ExternalCapabilityError("Clock is unavailable", error),
    };
  }
}

function buildGraph(snapshot: KnowledgeSnapshot): AtlasGraph {
  const nodes: Record<string, string> = {};
  const edges: Record<string, string[]> = {};
  const reverseEdges: Record<string, string[]> = {};

  for (const object of snapshot.objects) {
    nodes[object.id] = object.id;
    edges[object.id] = [];
    reverseEdges[object.id] = [];
  }

  for (const relation of snapshot.relations) {
    if (!(relation.sourceId in nodes) || !(relation.targetId in nodes)) continue;
    edges[relation.sourceId].push(relation.targetId);
    reverseEdges[relation.targetId].push(relation.sourceId);
  }

  return { nodes, edges, reverseEdges };
}

function buildStats(snapshot: KnowledgeSnapshot): AtlasIndexStats {
  const types: Record<string, number> = {};
  for (const object of snapshot.objects) {
    types[object.type] = (types[object.type] ?? 0) + 1;
  }

  return {
    objects: snapshot.objects.length,
    relations: snapshot.relations.length,
    tasks: snapshot.tasks.length,
    types,
  };
}
