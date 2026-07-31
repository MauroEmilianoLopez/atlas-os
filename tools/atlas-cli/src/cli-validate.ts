import { FilesystemKnowledgeSource } from "./adapters/filesystem-source.js";
import { validateKnowledgeBase } from "./core/validate.js";

export function runValidateCommand(vaultRoot: string, write: (line: string) => void): number {
  const report = validateKnowledgeBase(new FilesystemKnowledgeSource(vaultRoot));

  if (report.ok) {
    write("Atlas validation passed.");
  } else {
    write("Atlas validation failed.\n");
    const byFile = new Map<string, string[]>();
    for (const error of report.errors) {
      if (!byFile.has(error.file)) byFile.set(error.file, []);
      byFile.get(error.file)!.push(error.message);
    }
    for (const [file, messages] of byFile) {
      write(`ERROR ${file}`);
      for (const message of messages) write(`- ${message}`);
      write("");
    }
  }

  for (const warning of report.warnings) {
    write(`WARNING ${warning.file}\n- ${warning.message}\n`);
  }

  write(`Files scanned: ${report.filesScanned}`);
  write(`Knowledge Objects: ${report.knowledgeObjects}`);
  write(`Relations checked: ${report.relationsChecked}`);
  write(`Task references checked: ${report.taskRefsChecked}`);
  write(`Errors: ${report.errors.length}`);
  write(`Warnings: ${report.warnings.length}`);

  return report.ok ? 0 : 1;
}
