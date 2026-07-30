import type { ValidationReport } from "./contracts.js";

export type CoreErrorCode =
  | "INVALID_ARGUMENT"
  | "DOMAIN_INVARIANT"
  | "VALIDATION_FAILED"
  | "REFERENCE_NOT_FOUND"
  | "SOURCE_UNAVAILABLE"
  | "EXTERNAL_CAPABILITY";

export class AtlasCoreError extends Error {
  readonly code: CoreErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: CoreErrorCode, message: string, details: Readonly<Record<string, unknown>> = {}, cause?: unknown) {
    super(message, { cause });
    this.name = "AtlasCoreError";
    this.code = code;
    this.details = details;
  }
}

export class InvalidArgumentError extends AtlasCoreError {
  constructor(argument: string, message: string) {
    super("INVALID_ARGUMENT", message, { argument });
    this.name = "InvalidArgumentError";
  }
}

export class DomainInvariantError extends AtlasCoreError {
  constructor(message: string, details: Readonly<Record<string, unknown>> = {}) {
    super("DOMAIN_INVARIANT", message, details);
    this.name = "DomainInvariantError";
  }
}

export class ValidationFailedError extends AtlasCoreError {
  constructor(report: ValidationReport) {
    super("VALIDATION_FAILED", "Knowledge validation failed", { report });
    this.name = "ValidationFailedError";
  }
}

export class ReferenceNotFoundError extends AtlasCoreError {
  constructor(reference: string) {
    super("REFERENCE_NOT_FOUND", `Reference not found: ${reference}`, { reference });
    this.name = "ReferenceNotFoundError";
  }
}

export class SourceUnavailableError extends AtlasCoreError {
  constructor(message: string, cause?: unknown) {
    super("SOURCE_UNAVAILABLE", message, {}, cause);
    this.name = "SourceUnavailableError";
  }
}

export class ExternalCapabilityError extends AtlasCoreError {
  constructor(message: string, cause?: unknown) {
    super("EXTERNAL_CAPABILITY", message, {}, cause);
    this.name = "ExternalCapabilityError";
  }
}
