import type { AtlasIndex, ContextResult } from "./core/contracts.js";
import { buildIndex } from "./indexer.js";
import { loadCoreIndex, resolveSeed } from "./adapters/index-json.js";
import { runActivation, type ActivationCache } from "./activation.js";
import { SystemClock } from "./adapters/system-clock.js";
import { assembleContext } from "./core/context.js";

type ContinueNode = {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly sourcePath?: string;
  readonly depth: number;
  readonly score: number;
};

export function runContinueCommand(vaultRoot: string, seedRef: string): string {
  const indexResult = buildIndex(vaultRoot, { write: true });
  if (!indexResult.ok) {
    throw new Error(`Atlas continue failed.\nReason: ${indexResult.reason ?? "unknown"}.`);
  }

  const index = loadCoreIndex(vaultRoot);
  const seedId = resolveSeed(index, seedRef);
  if (!seedId) {
    throw new Error(`Could not resolve seed "${seedRef}" to any Knowledge Object.`);
  }

  const activationResult = runActivation(vaultRoot, { clock: new SystemClock() });
  if (!activationResult.ok) {
    throw activationResult.error;
  }

  const rank = Object.fromEntries(
    Object.values(activationResult.value.entries).map((entry) => [entry.id, entry.structural_score]),
  );
  const contextResult = assembleContext(index, {
    seedId,
    hops: 2,
    budget: 20,
    direction: "both",
    coreOnly: false,
    rank,
  });
  if (!contextResult.ok) {
    throw contextResult.error;
  }

  return renderContinueBrief(index, activationResult.value, contextResult.value, seedRef, seedId);
}

function renderContinueBrief(
  index: AtlasIndex,
  activation: ActivationCache,
  context: ContextResult,
  seedRef: string,
  seedId: string,
): string {
  const seed = index.objects.find((object) => object.id === seedId);
  const relatedNodes = prioritizeContinueNodes(
    context.nodes.filter((node) => node.id !== seedId),
    index,
    activation,
  );
  const prioritizedNodes = prioritizeContinueNodes(context.nodes, index, activation);
  const decisionNodes = pickNodes(context, index, activation, ["decision", "policy"], 3);
  const constraintNodes = pickNodes(context, index, activation, ["constraint", "task", "requirement"], 3);
  const contextHighlights = relatedNodes.slice(0, 3);
  const filePaths = collectUniquePathsInOrder(prioritizedNodes, 5);
  const topAction = decisionNodes[0] ?? contextHighlights[0] ?? prioritizedNodes[0];

  const lines: string[] = [];
  lines.push(`# Continuar: ${seed?.title ?? seedRef}`);
  lines.push("");
  lines.push("## En qué estabas");
  lines.push(`- Estabas retomando **${seed?.title ?? seedRef}**.`);
  if (contextHighlights.length > 0) {
    lines.push(`- El contexto más cercano ya apunta a **${contextHighlights[0].title}**.`);
  }
  if (decisionNodes.length > 0) {
    lines.push(`- La decisión vigente más sensible es **${decisionNodes[0].title}**.`);
  }
  lines.push("");

  lines.push("## Próximo paso");
  lines.push(`- ${renderNextStep(topAction)}`);
  lines.push("");

  lines.push("## Decisiones vigentes");
  if (decisionNodes.length > 0) {
    for (const node of decisionNodes) {
      lines.push(formatNodeLine(node));
    }
    lines.push("");
  }

  if (constraintNodes.length > 0) {
    lines.push("## Restricciones");
    for (const node of constraintNodes) {
      lines.push(formatNodeLine(node));
    }
    lines.push("");
  }

  lines.push("## Contexto relacionado");
  if (contextHighlights.length === 0) {
    lines.push("- Ninguno.");
  } else {
    for (const node of contextHighlights) {
      lines.push(formatContextLine(node));
    }
  }
  lines.push("");

  lines.push("## Archivos para abrir");
  if (filePaths.length === 0) {
    lines.push("- Ninguno.");
  } else {
    filePaths.forEach((file, index) => {
      const prefix = index === 0 ? "1. Primero" : `${index + 1}.`;
      lines.push(`${prefix} \`${file}\``);
    });
  }

  return lines.join("\n");
}

function pickNodes(
  context: ContextResult,
  index: AtlasIndex,
  activation: ActivationCache,
  types: readonly string[],
  limit: number,
): ContinueNode[] {
  const wanted = new Set(types);
  return prioritizeContinueNodes(
    context.nodes.filter((node) => wanted.has(node.type)),
    index,
    activation,
  ).slice(0, limit);
}

function prioritizeContinueNodes(
  nodes: ContextResult["nodes"],
  index: AtlasIndex,
  activation: ActivationCache,
): ContinueNode[] {
  return nodes
    .map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      sourcePath: index.objects.find((object) => object.id === node.id)?.sourcePath,
      depth: node.depth,
      score: activation.entries[node.id]?.structural_score ?? 0,
    }))
    .sort(compareContinuePriority);
}

export function compareContinuePriority(left: ContinueNode, right: ContinueNode): number {
  return right.score - left.score
    || left.depth - right.depth
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id);
}

function collectUniquePathsInOrder(nodes: ContinueNode[], limit: number): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const node of nodes) {
    if (!node.sourcePath || seen.has(node.sourcePath)) continue;
    seen.add(node.sourcePath);
    ordered.push(node.sourcePath);
    if (ordered.length >= limit) break;
  }

  return ordered;
}

function formatNodeLine(node: { title: string; type: string; sourcePath?: string; depth: number; score: number }): string {
  return `- [d${node.depth}] **${node.title}** (${node.type}) — score \`${node.score}\`${node.sourcePath ? ` — \`${node.sourcePath}\`` : ""}`;
}

function formatContextLine(node: { title: string; type: string; sourcePath?: string }): string {
  return `- **${node.title}** (${node.type})${node.sourcePath ? ` — \`${node.sourcePath}\`` : ""}`;
}

function renderNextStep(
  item: { title: string; sourcePath?: string } | undefined,
): string {
  if (!item) return "Abrí el archivo más cercano que ya conozcas y seguí desde ahí.";

  const label = item.sourcePath ?? item.title;
  return `Abrí primero \`${label}\` para retomar el trabajo desde el material más útil.`;
}
