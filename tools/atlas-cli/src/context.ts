// context.ts — Context Engine v0 (RFC-001.1 §9, first slice).
// Given a seed node, assemble the minimal relevant subgraph by breadth-first traversal over
// STRONG edges, up to a hop limit and a node budget. Works entirely on the pre-built graph
// (index-loader) — never re-parses Markdown. This is the "grafo fuerte" phase of the cascade.
//
// Explicitly NOT in v0: activation ranking (no activation model yet), semantic search (weak graph
// = P4), token-budgeted final context (needs body + activation). v0 budget is measured in NODES,
// and we are honest about that limitation.

import type { LoadedIndex } from "./index-loader.js";
import type { GraphEdge, ReverseEdge } from "./graph.js";

export type Direction = "out" | "in" | "both";

export interface ContextOptions {
  hops?: number;        // max traversal depth (default 2)
  budget?: number;      // max nodes in the assembled context, incl. seed (default 20)
  direction?: Direction; // follow forward edges, reverse edges, or both (default "both")
  coreOnly?: boolean;   // if true, only traverse core-kind edges (default false)
  activation?: Record<string, number>; // optional id->score; when present, ranks neighbors under budget
}

export interface ContextNode {
  id: string;
  type: string;
  title: string;
  path: string;
  depth: number;        // hops from the seed (seed = 0)
}

export interface ContextEdge {
  source_id: string;
  target_id: string;
  relation: string;
  kind: "core" | "extended";
  direction: "out" | "in"; // relative to how it was traversed
}

export interface ContextResult {
  seed_id: string;
  hops: number;
  budget: number;
  direction: Direction;
  truncated: boolean;       // true if the budget cut off further relevant nodes
  nodes: ContextNode[];
  edges: ContextEdge[];
}

/**
 * Build a minimal context subgraph around a seed.
 * BFS by depth; within a depth level, expands neighbors until the node budget is hit.
 * Deterministic ordering (core edges before extended, then by target id) so results are stable.
 */
export function buildContext(
  idx: LoadedIndex,
  seedId: string,
  opts: ContextOptions = {},
): ContextResult {
  const hops = opts.hops ?? 2;
  const budget = opts.budget ?? 20;
  const direction = opts.direction ?? "both";
  const coreOnly = opts.coreOnly ?? false;

  const { nodes: graphNodes, edges, reverse_edges } = idx.graph;

  if (!graphNodes[seedId]) {
    return { seed_id: seedId, hops, budget, direction, truncated: false, nodes: [], edges: [] };
  }

  const visited = new Map<string, ContextNode>();
  const outEdges: ContextEdge[] = [];
  const seen = new Set<string>(); // edge dedupe key

  const seedNode = graphNodes[seedId];
  visited.set(seedId, { ...seedNode, depth: 0 });

  let frontier: string[] = [seedId];
  let truncated = false;

  for (let depth = 0; depth < hops; depth++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      // gather candidate edges from this node
      const candidates: { edge: ContextEdge; targetId: string }[] = [];

      if (direction === "out" || direction === "both") {
        for (const e of (edges[nodeId] ?? []) as GraphEdge[]) {
          if (coreOnly && e.kind !== "core") continue;
          candidates.push({
            edge: { source_id: nodeId, target_id: e.target_id, relation: e.relation, kind: e.kind, direction: "out" },
            targetId: e.target_id,
          });
        }
      }
      if (direction === "in" || direction === "both") {
        for (const e of (reverse_edges[nodeId] ?? []) as ReverseEdge[]) {
          if (coreOnly && e.kind !== "core") continue;
          candidates.push({
            edge: { source_id: e.source_id, target_id: nodeId, relation: e.relation, kind: e.kind, direction: "in" },
            targetId: e.source_id,
          });
        }
      }

      // Ordering: if an activation map is provided, rank neighbors by score (desc) so that under
      // budget the most structurally relevant enter first. Otherwise deterministic core-first/id.
      const act = opts.activation;
      candidates.sort((a, b) => {
        if (a.edge.kind !== b.edge.kind) return a.edge.kind === "core" ? -1 : 1;
        if (act) {
          const sa = act[a.targetId] ?? 0;
          const sb = act[b.targetId] ?? 0;
          if (sa !== sb) return sb - sa; // higher activation first
        }
        return a.targetId.localeCompare(b.targetId);
      });

      for (const c of candidates) {
        // record the edge (dedupe)
        const key = `${c.edge.source_id}|${c.edge.relation}|${c.edge.target_id}|${c.edge.direction}`;
        if (!seen.has(key)) {
          seen.add(key);
          outEdges.push(c.edge);
        }

        // add the neighbor node if new
        if (!visited.has(c.targetId)) {
          if (visited.size >= budget) {
            truncated = true;
            continue; // budget hit: don't add more nodes, but keep recording edges among known
          }
          const gn = graphNodes[c.targetId];
          if (!gn) continue; // edge to a non-KO (e.g. task target not in graph)
          visited.set(c.targetId, { ...gn, depth: depth + 1 });
          nextFrontier.push(c.targetId);
        }
      }
    }

    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  // keep only edges whose both endpoints made it into the context
  const finalEdges = outEdges.filter(
    (e) => visited.has(e.source_id) && visited.has(e.target_id),
  );

  const nodes = [...visited.values()].sort((a, b) =>
    a.depth - b.depth || a.id.localeCompare(b.id),
  );

  return { seed_id: seedId, hops, budget, direction, truncated, nodes, edges: finalEdges };
}

/** Render a context result as human-readable text (for the CLI). */
export function renderContext(idx: LoadedIndex, ctx: ContextResult): string {
  const lines: string[] = [];
  const seed = ctx.nodes.find((n) => n.id === ctx.seed_id);
  lines.push(`Context for: ${seed ? seed.title : ctx.seed_id}  (${ctx.seed_id})`);
  lines.push(`hops=${ctx.hops} budget=${ctx.budget} direction=${ctx.direction}${ctx.truncated ? "  [TRUNCATED by budget]" : ""}`);
  lines.push("");
  lines.push(`Nodes (${ctx.nodes.length}):`);
  for (const n of ctx.nodes) {
    const indent = "  ".repeat(n.depth);
    lines.push(`  ${indent}[d${n.depth}] ${n.type}: ${n.title}  (${n.path})`);
  }
  lines.push("");
  lines.push(`Edges (${ctx.edges.length}):`);
  const nameOf = (id: string) => ctx.nodes.find((n) => n.id === id)?.title ?? id;
  for (const e of ctx.edges) {
    const arrow = e.direction === "out" ? "->" : "<-";
    lines.push(`  ${nameOf(e.source_id)} --${e.relation}${arrow}-- ${nameOf(e.target_id)}  [${e.kind}]`);
  }
  return lines.join("\n");
}
