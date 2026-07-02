// graph.ts — build the typed graph (nodes + edges + reverse_edges) from indexed relations.
// Pure transformation: takes objects + flat relations, returns a traversal-ready structure.

import { CORE_RELATIONS } from "./types.js";

const CORE = new Set<string>(CORE_RELATIONS);

export interface GraphNode {
  id: string;
  type: string;
  title: string;
  path: string;
}

export interface GraphEdge {
  relation: string;
  target_id: string;
  strength: "strong";
  kind: "core" | "extended";
}

export interface ReverseEdge {
  relation: string;
  source_id: string;
  strength: "strong";
  kind: "core" | "extended";
}

export interface Graph {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge[]>;
  reverse_edges: Record<string, ReverseEdge[]>;
}

export interface IndexedObject {
  id: string;
  type: string;
  title: string;
  lifecycle: string;
  path: string;
  created: string;
  tags: string[];
  aliases: string[];
  // Provenance flags recovered from scalar relations whose value is "human"
  // (RFC-001.2 uses human endorsement as the strongest activation signal).
  endorsed_by_human?: boolean;
  validated_by_human?: boolean;
}

export interface IndexedRelation {
  source_id: string;
  source_path: string;
  relation: string;
  target_id: string;
  target_label?: string;
  strength: "strong";
  kind: "core" | "extended";
  deriva_de?: string[];
  escrito_por?: string;
  respaldado_por?: string;
  validado_por?: string;
}

export function relationKind(relation: string): "core" | "extended" {
  return CORE.has(relation) ? "core" : "extended";
}

/** Build the traversal-oriented graph. Only relations whose target is a known node become edges;
 *  relations to ids not present as objects (e.g. task_ targets) are kept out of node edges but
 *  remain in relations.json. This keeps the graph clean for KO-to-KO traversal. */
export function buildGraph(objects: IndexedObject[], relations: IndexedRelation[]): Graph {
  const nodes: Record<string, GraphNode> = {};
  for (const o of objects) {
    nodes[o.id] = { id: o.id, type: o.type, title: o.title, path: o.path };
  }

  const edges: Record<string, GraphEdge[]> = {};
  const reverse_edges: Record<string, ReverseEdge[]> = {};

  for (const r of relations) {
    // only build edges between two known KO nodes
    if (!nodes[r.source_id] || !nodes[r.target_id]) continue;

    (edges[r.source_id] ??= []).push({
      relation: r.relation,
      target_id: r.target_id,
      strength: "strong",
      kind: r.kind,
    });

    (reverse_edges[r.target_id] ??= []).push({
      relation: r.relation,
      source_id: r.source_id,
      strength: "strong",
      kind: r.kind,
    });
  }

  return { nodes, edges, reverse_edges };
}
