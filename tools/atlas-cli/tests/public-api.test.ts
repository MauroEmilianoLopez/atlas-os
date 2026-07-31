import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AtlasCoreError,
  DomainInvariantError,
  ExternalCapabilityError,
  InvalidArgumentError,
  ReferenceNotFoundError,
  SourceUnavailableError,
  ValidationFailedError,
} from "../src/core/errors.js";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "core");
const source = (name: string) => readFileSync(join(sourceRoot, name), "utf8");

describe("Atlas core public contract", () => {
  it("defines the documented canonical contracts and synchronous ports", () => {
    const contracts = source("contracts.ts");
    const ports = source("ports.ts");

    expect(contracts).toContain("export type CoreResult<T>");
    expect(contracts).toContain("export interface KnowledgeSnapshot");
    expect(contracts).toContain("export interface KnowledgeObject");
    expect(contracts).toContain("export interface Relation");
    expect(contracts).toContain("export interface ValidationReport");
    expect(contracts).toContain("export interface AtlasIndex");
    expect(contracts).toContain("export interface ContextQuery");
    expect(contracts).toContain("export interface ContextResult");
    expect(contracts).toContain("export interface ActivationWeights");
    expect(contracts).toContain("export interface ActivationResult");
    expect(ports).toContain("export interface KnowledgeSourcePort");
    expect(ports).toContain("load(): KnowledgeSnapshot");
    expect(ports).toContain("export interface ClockPort");
    expect(ports).toContain("now(): string");
  });

  it("represents domain failures as typed errors without presentation policy", () => {
    const invalidArgument = new InvalidArgumentError("seedId", "must not be empty");
    const missingReference = new ReferenceNotFoundError("ko_missing");
    const failedValidation = new ValidationFailedError({
      ok: false,
      filesScanned: 1,
      knowledgeObjects: 0,
      relationsChecked: 0,
      taskRefsChecked: 0,
      taskLogs: 0,
      errors: [{ level: "error", file: "knowledge/invalid.md", message: "id is invalid" }],
      warnings: [],
      issues: [{ code: "INVALID_ID", message: "id is invalid", severity: "error" }],
    });

    expect(invalidArgument).toBeInstanceOf(AtlasCoreError);
    expect(invalidArgument).toMatchObject({
      name: "InvalidArgumentError",
      code: "INVALID_ARGUMENT",
      details: { argument: "seedId" },
    });
    expect(missingReference).toMatchObject({
      name: "ReferenceNotFoundError",
      code: "REFERENCE_NOT_FOUND",
      details: { reference: "ko_missing" },
    });
    expect(failedValidation).toMatchObject({
      name: "ValidationFailedError",
      code: "VALIDATION_FAILED",
      details: { report: expect.objectContaining({ issues: expect.any(Array) }) },
    });
    expect(new DomainInvariantError("duplicate id")).toMatchObject({ code: "DOMAIN_INVARIANT" });
    expect(new SourceUnavailableError("knowledge source unavailable")).toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(new ExternalCapabilityError("clock unavailable")).toMatchObject({ code: "EXTERNAL_CAPABILITY" });
  });

  it("keeps adapter and CLI dependencies out of every core source file", () => {
    const forbiddenDependency = /\b(?:fs|path|commander|process|console)\b/;

    for (const file of ["contracts.ts", "errors.ts", "ports.ts"]) {
      expect(source(file)).not.toMatch(forbiddenDependency);
    }
  });
});
