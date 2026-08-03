import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemKnowledgeSource } from "../src/adapters/filesystem-source.js";

const fixtureVault = join(import.meta.dirname, "..", "..", "..", "vault-prototype");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("FilesystemKnowledgeSource", () => {
  it("loads the fixture vault with the legacy scan metrics and canonical records", () => {
    const snapshot = new FilesystemKnowledgeSource(fixtureVault).load();

    expect(snapshot.objects).toHaveLength(13);
    expect(snapshot.relations).toHaveLength(18);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.validation).toEqual({ filesScanned: 18, taskLogs: 1, diagnostics: [] });
  });

  it("reports malformed YAML as a continuable source diagnostic", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-filesystem-source-"));
    temporaryRoots.push(root);
    const brokenFile = join(root, "broken.md").split("\\").join("/");
    writeFileSync(join(root, "broken.md"), "---\ntitle: [\n---\n", "utf8");

    const snapshot = new FilesystemKnowledgeSource(root).load();

    expect(snapshot.objects).toEqual([]);
    expect(snapshot.validation).toMatchObject({
      filesScanned: 1,
      taskLogs: 0,
      diagnostics: [{ severity: "error", sourcePath: brokenFile }],
    });
    expect(snapshot.validation?.diagnostics[0]?.message).toContain("Invalid YAML frontmatter in broken.md:");
  });

  it("reports an unavailable vault as a render-ready source diagnostic", () => {
    const missingRoot = join(tmpdir(), "atlas-filesystem-source-missing");

    const snapshot = new FilesystemKnowledgeSource(missingRoot).load();

    expect(snapshot).toEqual({
      objects: [],
      relations: [],
      tasks: [],
      validation: {
        filesScanned: 0,
        taskLogs: 0,
        diagnostics: [{
          code: "LEGACY_SOURCE_DIAGNOSTIC",
          severity: "error",
          sourcePath: missingRoot,
          message: `Vault path does not exist: ${missingRoot}. Check the path and try again.`,
        }],
      },
    });
  });
});
