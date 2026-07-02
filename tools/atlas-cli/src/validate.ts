// validate.ts — the core validator. Runs all checks over a vault and returns issues + stats.

import { parseFile, findMarkdown } from "./parser.js";
import { commonFrontmatter, NON_KO_TYPES } from "./schemas.js";
import { extractRelations } from "./relations.js";
import { collectTaskIds, countTaskLogs } from "./task-log.js";
import { hasValidPrefix, prefixMatchesType } from "./id.js";
import { KO_TYPES, ALL_RELATIONS, type Issue } from "./types.js";

// Derived field names that must NOT appear at the top level of frontmatter (they live under derived:).
const DERIVED_FIELDS = [
  "activation_score",
  "confidence_level",
  "is_connected",
  "is_canonical",
  "is_deprecated",
  "is_evergreen",
  "review_required",
];

export interface ValidationResult {
  ok: boolean;
  filesScanned: number;
  knowledgeObjects: number;
  relationsChecked: number;
  taskRefsChecked: number;
  taskLogs: number;
  errors: Issue[];
  warnings: Issue[];
}

export function validateVault(vaultRoot: string): ValidationResult {
  const files = findMarkdown(vaultRoot);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  // Pass 1: parse all files, collect declared ids.
  const parsed = [];
  const idOwner = new Map<string, string>(); // id -> relPath (first owner)
  const allIds = new Set<string>();

  for (const abs of files) {
    try {
      parsed.push(parseFile(abs, vaultRoot));
    } catch (e) {
      // invalid YAML
      errors.push({ level: "error", file: relOf(abs, vaultRoot), message: (e as Error).message });
    }
  }

  // Collect ids first (so relation checks in pass 2 can see all ids).
  for (const p of parsed) {
    if (!p.hasFrontmatter) continue;
    const id = p.frontmatter.id;
    if (typeof id === "string" && id.length > 0) {
      if (allIds.has(id)) {
        errors.push({
          level: "error",
          file: p.relPath,
          message: `duplicate id "${id}" (also declared in ${idOwner.get(id)})`,
        });
      } else {
        allIds.add(id);
        idOwner.set(id, p.relPath);
      }
    }
  }

  const taskIds = collectTaskIds(vaultRoot);
  const taskLogs = countTaskLogs(vaultRoot);

  let knowledgeObjects = 0;
  let relationsChecked = 0;
  let taskRefsChecked = 0;

  // Pass 2: per-file validation.
  for (const p of parsed) {
    if (!p.hasFrontmatter) {
      // A plain markdown file (e.g. inbox.md) — fine, not a KO.
      continue;
    }
    const fm = p.frontmatter;
    const type = fm.type;

    // Non-KO structured files (daily, map, task_log): light touch, skip full KO contract.
    if (typeof type === "string" && NON_KO_TYPES.has(type)) {
      checkRelations(p, allIds, taskIds, errors, () => relationsChecked++, () => taskRefsChecked++);
      continue;
    }

    // Validate the common KO contract.
    const result = commonFrontmatter.safeParse(fm);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          level: "error",
          file: p.relPath,
          message: `frontmatter ${issue.path.join(".") || "(root)"}: ${issue.message}`,
        });
      }
      // still attempt relation checks below where possible
    } else {
      knowledgeObjects++;
      const ko = result.data;

      // id prefix checks
      if (!hasValidPrefix(ko.id)) {
        errors.push({ level: "error", file: p.relPath, message: `id "${ko.id}" has no valid Atlas prefix (ko_/agent_/task_/policy_)` });
      } else if (!prefixMatchesType(ko.id, ko.type)) {
        errors.push({ level: "error", file: p.relPath, message: `id "${ko.id}" prefix does not match type "${ko.type}"` });
      }

      // derived placeholder must exist and (for now) cached must be false
      if (ko.derived.cached !== false) {
        warnings.push({ level: "warning", file: p.relPath, message: `derived.cached should be false in P1 (got ${ko.derived.cached})` });
      }
    }

    // derived fields must not be written manually at top level
    for (const df of DERIVED_FIELDS) {
      if (df in fm) {
        errors.push({ level: "error", file: p.relPath, message: `derived field "${df}" must not be set manually at top level (it is computed under derived:)` });
      }
    }

    // relation checks (works regardless of KO contract result)
    const counted = checkRelations(p, allIds, taskIds, errors, () => relationsChecked++, () => taskRefsChecked++);
    void counted;
  }

  return {
    ok: errors.length === 0,
    filesScanned: files.length,
    knowledgeObjects,
    relationsChecked,
    taskRefsChecked,
    taskLogs,
    errors,
    warnings,
  };
}

function checkRelations(
  p: { relPath: string; frontmatter: Record<string, unknown> },
  allIds: Set<string>,
  taskIds: Set<string>,
  errors: Issue[],
  onRelation: () => void,
  onTaskRef: () => void,
) {
  const { relations, errors: structErrors } = extractRelations(p.frontmatter);
  for (const e of structErrors) {
    errors.push({ level: "error", file: p.relPath, message: e });
  }
  for (const r of relations) {
    onRelation();
    if (!r.target_id) continue; // structural error already reported
    // task_* targets resolve against the task log; everything else against declared ids.
    if (r.target_id.startsWith("task_")) {
      onTaskRef();
      if (!taskIds.has(r.target_id)) {
        errors.push({ level: "error", file: p.relPath, message: `relation ${r.key}[${r.index}].target_id points to unknown task ${r.target_id} (not found in task log)` });
      }
    } else if (!allIds.has(r.target_id)) {
      errors.push({ level: "error", file: p.relPath, message: `relation ${r.key}[${r.index}].target_id points to unknown id ${r.target_id}` });
    }
  }
}

function relOf(abs: string, root: string): string {
  return abs.replace(root, "").replace(/^[/\\]/, "");
}
