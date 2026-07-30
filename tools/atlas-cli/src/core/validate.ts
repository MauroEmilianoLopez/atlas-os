import type {
  KnowledgeObject,
  KnowledgeSnapshot,
  Relation,
  TaskRecord,
  ValidationIssue,
  ValidationReport,
} from "./contracts.js";
import { SourceUnavailableError } from "./errors.js";
import type { KnowledgeSourcePort } from "./ports.js";

const DERIVED_FIELDS = new Set([
  "activation_score",
  "confidence_level",
  "is_connected",
  "is_canonical",
  "is_deprecated",
  "is_evergreen",
  "review_required",
]);

const LIFECYCLES = new Set(["fleeting", "living", "archived"]);

export function validateKnowledgeBase(source: KnowledgeSourcePort): ValidationReport {
  const snapshot = loadSnapshot(source);
  const issues: ValidationIssue[] = [];
  const objectIds = new Set<string>();
  const taskIds = new Set<string>();

  for (const object of snapshot.objects) {
    if (objectIds.has(object.id)) {
      issues.push(issue("DUPLICATE_ID", `Duplicate knowledge object id: ${object.id}`, object.id));
    } else {
      objectIds.add(object.id);
    }
  }

  for (const object of snapshot.objects) {
    validateObject(object, issues);
  }

  for (const task of snapshot.tasks) {
    if (taskIds.has(task.id)) {
      issues.push(issue("DUPLICATE_TASK_ID", `Duplicate task id: ${task.id}`, task.id));
    } else {
      taskIds.add(task.id);
    }
  }

  for (const task of snapshot.tasks) {
    validateTask(task, issues);
  }

  let taskRefsChecked = 0;
  for (const relation of snapshot.relations) {
    if (relation.targetId.startsWith("task_")) {
      taskRefsChecked++;
    }

    validateRelation(relation, objectIds, taskIds, issues);
  }

  return {
    ok: issues.length === 0,
    filesScanned: snapshot.objects.length,
    knowledgeObjects: snapshot.objects.length,
    relationsChecked: snapshot.relations.length,
    taskRefsChecked,
    taskLogs: 0,
    issues,
  };
}

function loadSnapshot(source: KnowledgeSourcePort): KnowledgeSnapshot {
  try {
    return source.load();
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      throw error;
    }

    throw new SourceUnavailableError("Knowledge source is unavailable", error);
  }
}

function validateObject(object: KnowledgeObject, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(object.id)) {
    issues.push(issue("INVALID_ID", "Knowledge object id must be a non-empty string"));
  } else if (!object.id.startsWith(prefixFor(object.type))) {
    issues.push(issue("ID_PREFIX_MISMATCH", `Knowledge object id prefix does not match type: ${object.type}`, object.id));
  }

  if (!isNonEmptyString(object.type)) {
    issues.push(issue("INVALID_OBJECT_TYPE", "Knowledge object type must be a non-empty string", object.id));
  }
  if (!isNonEmptyString(object.title)) {
    issues.push(issue("INVALID_OBJECT_TITLE", "Knowledge object title must be a non-empty string", object.id));
  }
  if (!isNonEmptyString(object.created)) {
    issues.push(issue("INVALID_CREATED_AT", "Knowledge object created value must be a non-empty string", object.id));
  }
  if (!LIFECYCLES.has(object.lifecycle)) {
    issues.push(issue("INVALID_LIFECYCLE", `Unsupported lifecycle: ${String(object.lifecycle)}`, object.id));
  }

  for (const field of DERIVED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(object.attributes, field)) {
      issues.push(issue("DERIVED_FIELD_MANUAL", `Derived field must not be set manually: ${field}`, object.id));
    }
  }
}

function validateTask(task: TaskRecord, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(task.id) || !task.id.startsWith("task_")) {
    issues.push(issue("INVALID_TASK_ID", "Task id must use the task_ prefix", task.id));
  }
  if (task.status !== null && !isNonEmptyString(task.status)) {
    issues.push(issue("INVALID_TASK_STATUS", "Task status must be a non-empty string or null", task.id));
  }
  if (task.createdAt !== null && !isNonEmptyString(task.createdAt)) {
    issues.push(issue("INVALID_TASK_CREATED_AT", "Task createdAt must be a non-empty string or null", task.id));
  }
}

function validateRelation(
  relation: Relation,
  objectIds: ReadonlySet<string>,
  taskIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  if (!isNonEmptyString(relation.sourceId) || !objectIds.has(relation.sourceId)) {
    issues.push(issue("UNKNOWN_RELATION_SOURCE", `Relation source does not exist: ${relation.sourceId}`, relation.sourceId));
  }
  if (!isNonEmptyString(relation.kind)) {
    issues.push(issue("INVALID_RELATION_KIND", "Relation kind must be a non-empty string", relation.sourceId));
  }
  if (!isNonEmptyString(relation.targetId)) {
    issues.push(issue("INVALID_RELATION_TARGET", "Relation target must be a non-empty string", relation.sourceId));
  } else if (relation.targetId.startsWith("task_") && !taskIds.has(relation.targetId)) {
    issues.push(issue("UNKNOWN_TASK_REFERENCE", `Relation target task does not exist: ${relation.targetId}`, relation.sourceId));
  } else if (!relation.targetId.startsWith("task_") && !objectIds.has(relation.targetId)) {
    issues.push(issue("UNKNOWN_RELATION_TARGET", `Relation target does not exist: ${relation.targetId}`, relation.sourceId));
  }
}

function prefixFor(type: string): string {
  if (type === "agent") return "agent_";
  if (type === "task") return "task_";
  if (type === "policy") return "policy_";
  return "ko_";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function issue(code: string, message: string, subject?: string): ValidationIssue {
  return subject === undefined
    ? { code, message, severity: "error" }
    : { code, message, severity: "error", subject };
}
