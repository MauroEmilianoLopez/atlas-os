import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseFile } from "./parser.js";

export type SessionStateStatus =
  | "active"
  | "blocked"
  | "ready_for_review"
  | "ready_to_commit"
  | "published"
  | "done";

export interface SessionStateSnapshot {
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly currentWorkUnit: string;
  readonly currentBranch: string;
  readonly currentGoal: string;
  readonly status: SessionStateStatus;
  readonly completed: readonly string[];
  readonly pending: readonly string[];
  readonly nextStep: string;
  readonly lastDecisions: readonly string[];
}

export interface SessionStateUpdateInput {
  readonly currentWorkUnit: string;
  readonly currentBranch: string;
  readonly currentGoal: string;
  readonly status: SessionStateStatus;
  readonly nextStep: string;
  readonly completed?: readonly string[];
  readonly pending?: readonly string[];
  readonly lastDecisions?: readonly string[];
  readonly updatedAt?: string;
}

export type SessionStateReadResult =
  | { readonly ok: true; readonly value: SessionStateSnapshot }
  | { readonly ok: false; readonly reason: "missing" | "invalid"; readonly message: string };

export type SessionStateValidationResult =
  | { readonly ok: true; readonly value: SessionStateSnapshot }
  | { readonly ok: false; readonly reason: "invalid"; readonly message: string };

const SESSION_STATE_FILE = path.join("work", "session-state.md");
const SESSION_STATE_STATUSES = new Set<SessionStateStatus>([
  "active",
  "blocked",
  "ready_for_review",
  "ready_to_commit",
  "published",
  "done",
]);
const ISO_8601_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/;

export function readSessionState(vaultRoot: string): SessionStateReadResult {
  const absPath = path.join(vaultRoot, SESSION_STATE_FILE);
  if (!fs.existsSync(absPath)) {
    return {
      ok: false,
      reason: "missing",
      message: `No Session State found at ${SESSION_STATE_FILE}.`,
    };
  }

  try {
    const parsed = parseFile(absPath, vaultRoot);
    if (parsed.hasFrontmatter) {
      return {
        ok: false,
        reason: "invalid",
        message: `Session State must not use YAML frontmatter: ${SESSION_STATE_FILE}.`,
      };
    }

    const normalized = normalizeSessionState(parsed.body);
    if (!normalized.ok) {
      return {
        ok: false,
        reason: "invalid",
        message: normalized.message,
      };
    }

    return { ok: true, value: normalized.value };
  } catch (error) {
    return {
      ok: false,
      reason: "invalid",
      message: `Invalid Session State: ${(error as Error).message}`,
    };
  }
}

export function normalizeSessionStateUpdate(input: SessionStateUpdateInput): SessionStateValidationResult {
  const schemaVersion = parseSchemaVersion(1);
  const updatedAt = parseIso8601Timestamp(input.updatedAt ?? new Date().toISOString(), "updated_at");
  const currentWorkUnit = parseRequiredString(input.currentWorkUnit, "current_work_unit");
  const currentBranch = parseRequiredString(input.currentBranch, "current_branch");
  const currentGoal = parseRequiredString(input.currentGoal, "current_goal");
  const status = parseStatus(input.status);
  const completed = parseStringList(input.completed, "completed");
  const pending = parseStringList(input.pending, "pending");
  const nextStep = parseRequiredString(input.nextStep, "next_step");
  const lastDecisions = parseStringList(input.lastDecisions, "last_decisions");

  if (!schemaVersion.ok) return schemaVersion;
  if (!updatedAt.ok) return updatedAt;
  if (!currentWorkUnit.ok) return currentWorkUnit;
  if (!currentBranch.ok) return currentBranch;
  if (!currentGoal.ok) return currentGoal;
  if (!status.ok) return status;
  if (!completed.ok) return completed;
  if (!pending.ok) return pending;
  if (!nextStep.ok) return nextStep;
  if (!lastDecisions.ok) return lastDecisions;

  return {
    ok: true,
    value: {
      schemaVersion: schemaVersion.value,
      updatedAt: updatedAt.value,
      currentWorkUnit: currentWorkUnit.value,
      currentBranch: currentBranch.value,
      currentGoal: currentGoal.value,
      status: status.value,
      completed: completed.value,
      pending: pending.value,
      nextStep: nextStep.value,
      lastDecisions: lastDecisions.value,
    },
  };
}

export function writeSessionState(vaultRoot: string, snapshot: SessionStateSnapshot): { readonly ok: true; readonly path: string } {
  const absPath = path.join(vaultRoot, SESSION_STATE_FILE);
  const dir = path.dirname(absPath);
  const tempPath = path.join(dir, `${path.basename(absPath)}.${process.pid}.${Date.now()}.tmp`);

  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(tempPath, renderSessionState(snapshot), "utf8");
    fs.renameSync(tempPath, absPath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
  }

  return { ok: true, path: absPath };
}

export function renderSessionState(snapshot: SessionStateSnapshot): string {
  const lines: string[] = [];
  lines.push("# Session State");
  lines.push("");
  lines.push(`schema_version: ${snapshot.schemaVersion}`);
  lines.push(`updated_at: ${quoteYamlString(snapshot.updatedAt)}`);
  lines.push(`current_work_unit: ${quoteYamlString(snapshot.currentWorkUnit)}`);
  lines.push(`current_branch: ${quoteYamlString(snapshot.currentBranch)}`);
  lines.push(`current_goal: ${quoteYamlString(snapshot.currentGoal)}`);
  lines.push(`status: ${snapshot.status}`);
  lines.push("completed:");
  for (const item of snapshot.completed) {
    lines.push(`  - ${quoteYamlString(item)}`);
  }
  lines.push("pending:");
  for (const item of snapshot.pending) {
    lines.push(`  - ${quoteYamlString(item)}`);
  }
  lines.push(`next_step: ${quoteYamlString(snapshot.nextStep)}`);
  lines.push("last_decisions:");
  for (const item of snapshot.lastDecisions) {
    lines.push(`  - ${quoteYamlString(item)}`);
  }
  lines.push("");
  lines.push("## Completed");
  pushBulletLines(lines, snapshot.completed);
  lines.push("");
  lines.push("## Pending");
  pushBulletLines(lines, snapshot.pending);
  lines.push("");
  lines.push("## Next Step");
  lines.push(`- ${snapshot.nextStep}`);
  lines.push("");
  lines.push("## Recent Decisions");
  pushBulletLines(lines, snapshot.lastDecisions);
  lines.push("");
  return lines.join("\n");
}

function normalizeSessionState(
  body: string,
): SessionStateReadResult | { readonly ok: true; readonly value: SessionStateSnapshot } {
  if (!hasRequiredSections(body)) {
    return {
      ok: false,
      reason: "invalid",
      message: "Session State is missing one or more required sections.",
    };
  }

  const metadata = parseMetadata(body);
  if (!metadata.ok) {
    return metadata;
  }

  const schemaVersion = parseSchemaVersion(metadata.value.schema_version);
  const updatedAt = parseRequiredString(metadata.value.updated_at, "updated_at");
  const currentWorkUnit = parseRequiredString(metadata.value.current_work_unit, "current_work_unit");
  const currentBranch = parseRequiredString(metadata.value.current_branch, "current_branch");
  const currentGoal = parseRequiredString(metadata.value.current_goal, "current_goal");
  const status = parseStatus(metadata.value.status);
  const completed = parseStringList(metadata.value.completed, "completed");
  const pending = parseStringList(metadata.value.pending, "pending");
  const nextStep = parseRequiredString(metadata.value.next_step, "next_step");
  const lastDecisions = parseStringList(metadata.value.last_decisions, "last_decisions");

  if (!schemaVersion.ok) return schemaVersion;
  if (!updatedAt.ok) return updatedAt;
  if (!currentWorkUnit.ok) return currentWorkUnit;
  if (!currentBranch.ok) return currentBranch;
  if (!currentGoal.ok) return currentGoal;
  if (!status.ok) return status;
  if (!completed.ok) return completed;
  if (!pending.ok) return pending;
  if (!nextStep.ok) return nextStep;
  if (!lastDecisions.ok) return lastDecisions;

  return {
    ok: true,
    value: {
      schemaVersion: schemaVersion.value,
      updatedAt: updatedAt.value,
      currentWorkUnit: currentWorkUnit.value,
      currentBranch: currentBranch.value,
      currentGoal: currentGoal.value,
      status: status.value,
      completed: completed.value,
      pending: pending.value,
      nextStep: nextStep.value,
      lastDecisions: lastDecisions.value,
    },
  };
}

function parseMetadata(
  body: string,
): { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false; readonly reason: "invalid"; readonly message: string } {
  const lines = body.split(/\r?\n/);
  if (lines[0]?.trim() !== "# Session State") {
    return {
      ok: false,
      reason: "invalid",
      message: "Session State must start with a '# Session State' heading.",
    };
  }

  const sectionStart = lines.findIndex((line, index) => index > 0 && line.startsWith("## "));
  if (sectionStart < 0) {
    return {
      ok: false,
      reason: "invalid",
      message: "Session State is missing the required sections.",
    };
  }

  const metadataLines = lines.slice(1, sectionStart).filter((line) => line.trim().length > 0);
  if (metadataLines.length === 0) {
    return {
      ok: false,
      reason: "invalid",
      message: "Session State metadata block is empty.",
    };
  }

  try {
    const parsed = yaml.load(metadataLines.join("\n"), { schema: yaml.JSON_SCHEMA });
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        reason: "invalid",
        message: "Session State metadata must be a mapping.",
      };
    }

    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      reason: "invalid",
      message: `Invalid Session State metadata: ${(error as Error).message}`,
    };
  }
}

function hasRequiredSections(body: string): boolean {
  return [
    "## Completed",
    "## Pending",
    "## Next Step",
    "## Recent Decisions",
  ].every((section) => body.includes(section));
}

function parseSchemaVersion(value: unknown): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: "invalid"; readonly message: string } {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (parsed !== 1) {
    return { ok: false, reason: "invalid", message: "Session State schema_version must be 1." };
  }
  return { ok: true, value: 1 };
}

function parseRequiredString(value: unknown, key: string): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: "invalid"; readonly message: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, reason: "invalid", message: `Session State field "${key}" must be a non-empty string.` };
  }
  return { ok: true, value: value.trim() };
}

function parseIso8601Timestamp(value: unknown, key: string): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: "invalid"; readonly message: string } {
  const parsed = parseRequiredString(value, key);
  if (!parsed.ok) return parsed;

  const match = ISO_8601_TIMESTAMP.exec(parsed.value);
  if (match === null) {
    return { ok: false, reason: "invalid", message: `Session State field "${key}" must be a valid ISO-8601 timestamp.` };
  }

  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  const numericSecond = second === undefined ? 0 : Number(second);
  const numericOffsetHour = offsetHour === undefined ? 0 : Number(offsetHour);
  const numericOffsetMinute = offsetMinute === undefined ? 0 : Number(offsetMinute);
  const daysInMonth = new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate();

  if (
    numericMonth < 1 || numericMonth > 12 ||
    numericDay < 1 || numericDay > daysInMonth ||
    numericHour > 23 ||
    numericMinute > 59 ||
    numericSecond > 59 ||
    numericOffsetHour > 23 ||
    numericOffsetMinute > 59
  ) {
    return { ok: false, reason: "invalid", message: `Session State field "${key}" must be a valid ISO-8601 timestamp.` };
  }

  return { ok: true, value: parsed.value };
}

function parseStatus(value: unknown): { readonly ok: true; readonly value: SessionStateStatus } | { readonly ok: false; readonly reason: "invalid"; readonly message: string } {
  if (typeof value !== "string" || !SESSION_STATE_STATUSES.has(value as SessionStateStatus)) {
    return {
      ok: false,
      reason: "invalid",
      message: `Session State status must be one of: ${Array.from(SESSION_STATE_STATUSES).join(", ")}.`,
    };
  }
  return { ok: true, value: value as SessionStateStatus };
}

function parseStringList(value: unknown, key: string): { readonly ok: true; readonly value: string[] } | { readonly ok: false; readonly reason: "invalid"; readonly message: string } {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, reason: "invalid", message: `Session State field "${key}" must be a list of strings.` };
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return { ok: false, reason: "invalid", message: `Session State field "${key}" must contain only non-empty strings.` };
    }
    items.push(item.trim());
  }
  if (items.length > 3) {
    return { ok: false, reason: "invalid", message: `Session State field "${key}" must contain at most 3 items.` };
  }
  return { ok: true, value: items };
}

function quoteYamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function pushBulletLines(lines: string[], values: readonly string[]): void {
  if (values.length === 0) {
    lines.push("- None.");
    return;
  }

  for (const value of values) {
    lines.push(`- ${value}`);
  }
}
