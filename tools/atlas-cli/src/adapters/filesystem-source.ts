import { existsSync } from "node:fs";
import type {
  KnowledgeObject,
  KnowledgeSnapshot,
  Relation,
  TaskRecord,
  ValidationIssue,
} from "../core/contracts.js";
import type { KnowledgeSourcePort } from "../core/ports.js";
import { relationKind } from "../graph.js";
import { parseFile, findMarkdown } from "../parser.js";
import { extractRelations } from "../relations.js";
import { commonFrontmatter, NON_KO_TYPES } from "../schemas.js";
import { collectTaskIds, countTaskLogs } from "../task-log.js";
import { validateVault } from "../validate.js";
import { SCALAR_RELATIONS } from "../types.js";

/**
 * Compatibility source for the existing vault layout. It owns filesystem and
 * parser mechanics while exposing the core-owned KnowledgeSourcePort contract.
 */
export class FilesystemKnowledgeSource implements KnowledgeSourcePort {
  constructor(private readonly vaultRoot: string) {}

  load(): KnowledgeSnapshot {
    const legacy = validateVault(this.vaultRoot);
    if (!existsSync(this.vaultRoot)) {
      return emptySnapshot(legacy.filesScanned, legacy.taskLogs, legacyDiagnostics(legacy.errors, legacy.warnings));
    }

    const parsed = findMarkdown(this.vaultRoot).flatMap((file) => {
      try {
        return [parseFile(file, this.vaultRoot)];
      } catch {
        return [];
      }
    });

    const objects = parsed.flatMap(toKnowledgeObject);
    const objectIds = new Set(objects.map((object) => object.id));
    const fallbackRelationSourceId = objects[0]?.id;
    const relations = parsed.flatMap((file) => toRelations(file, objectIds, fallbackRelationSourceId));
    const tasks = [...collectTaskIds(this.vaultRoot)]
      .filter((id) => id !== "task_log")
      .map<TaskRecord>((id) => ({ id, status: null, createdAt: null }));

    return {
      objects,
      relations,
      tasks,
      validation: {
        filesScanned: legacy.filesScanned,
        taskLogs: countTaskLogs(this.vaultRoot),
        diagnostics: legacyDiagnostics(legacy.errors, legacy.warnings),
      },
    };
  }
}

function toKnowledgeObject(parsed: ReturnType<typeof parseFile>): KnowledgeObject[] {
  if (!parsed.hasFrontmatter) return [];

  const result = commonFrontmatter.safeParse(parsed.frontmatter);
  if (!result.success || NON_KO_TYPES.has(result.data.type)) return [];

  const { id, type, title, lifecycle, created, ...attributes } = result.data;
  return [{ id, type, title, lifecycle, created, attributes, sourcePath: parsed.relPath }];
}

function toRelations(
  parsed: ReturnType<typeof parseFile>,
  objectIds: ReadonlySet<string>,
  fallbackSourceId: string | undefined,
): Relation[] {
  const sourceId = parsed.frontmatter.id;
  if (typeof sourceId !== "string" || sourceId.length === 0) return [];
  const normalizedSourceId = objectIds.has(sourceId) ? sourceId : fallbackSourceId;
  if (normalizedSourceId === undefined) return [];

  return extractRelations(parsed.frontmatter).relations.flatMap((relation) => {
    if (relation.target_id === undefined) return [];
    const raw = (relation.raw ?? {}) as Record<string, unknown>;
    return [{
      sourceId: normalizedSourceId,
      originalSourceId: sourceId,
      kind: relation.key,
      targetId: relation.target_id,
      originalTargetId: relation.target_id,
      label: typeof raw.label === "string" ? raw.label : undefined,
      derivesFrom: Array.isArray(raw.deriva_de) ? raw.deriva_de.map((value) => String(value)) : undefined,
      writtenBy: typeof raw.escrito_por === "string" ? raw.escrito_por : undefined,
      endorsedBy: typeof raw.respaldado_por === "string" ? raw.respaldado_por : undefined,
      validatedBy: typeof raw.validado_por === "string" ? raw.validado_por : undefined,
      traversalKind: relationKind(relation.key),
      sourcePath: parsed.relPath,
    }];
  }).concat(
    [...SCALAR_RELATIONS].flatMap((key) => {
      const value = parsed.frontmatter[key];
      if (typeof value !== "string" || value === "human") return [];
      return [{
        sourceId: normalizedSourceId,
        originalSourceId: sourceId,
        kind: key,
        targetId: value,
        originalTargetId: value,
        label: undefined,
        derivesFrom: undefined,
        writtenBy: undefined,
        endorsedBy: undefined,
        validatedBy: undefined,
        traversalKind: relationKind(key),
        sourcePath: parsed.relPath,
      }];
    }),
  );
}

function emptySnapshot(filesScanned: number, taskLogs: number, diagnostics: readonly ValidationIssue[]): KnowledgeSnapshot {
  return { objects: [], relations: [], tasks: [], validation: { filesScanned, taskLogs, diagnostics } };
}

function legacyDiagnostics(
  errors: readonly { level: "error" | "warning"; file: string; message: string }[],
  warnings: readonly { level: "error" | "warning"; file: string; message: string }[],
): ValidationIssue[] {
  return [...errors, ...warnings].map((issue) => ({
    code: "LEGACY_SOURCE_DIAGNOSTIC",
    severity: issue.level,
    sourcePath: issue.file,
    message: issue.message,
  }));
}
