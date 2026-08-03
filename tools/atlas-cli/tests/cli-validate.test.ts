import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { runValidateCommand } from "../src/cli-validate.js";

const fixtureVault = join(import.meta.dirname, "..", "..", "..", "vault-prototype");

describe("validate CLI composition", () => {
  it("renders the characterized successful validation report without changing its exit status", () => {
    const lines: string[] = [];

    const exitCode = runValidateCommand(fixtureVault, (line) => lines.push(line));

    expect(exitCode).toBe(0);
    expect(lines).toEqual([
      "Atlas validation passed.",
      "Files scanned: 18",
      "Knowledge Objects: 13",
      "Relations checked: 18",
      "Task references checked: 1",
      "Errors: 0",
      "Warnings: 0",
    ]);
  });

  it("renders grouped diagnostics and returns the historical failure status", () => {
    const lines: string[] = [];
    const missingVault = join(fixtureVault, "missing");

    const exitCode = runValidateCommand(missingVault, (line) => lines.push(line));

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "Atlas validation failed.\n",
      `ERROR ${missingVault}`,
      `- Vault path does not exist: ${missingVault}. Check the path and try again.`,
      "",
      "Files scanned: 0",
      "Knowledge Objects: 0",
      "Relations checked: 0",
      "Task references checked: 0",
      "Errors: 1",
      "Warnings: 0",
    ]);
  });
});
