// task-log.ts — parse task ids out of append-only task logs (RFC-002 §8).
// Tasks are NOT files; they are entries inside execution/tasks/*.md. We collect their ids
// so that produjo/produced_por references can be resolved.

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

const TASK_ID = /(^|[\s:"'\[])(task_[A-Za-z0-9]+)/g;

/** Collect every task_id that appears in any file under execution/tasks/. */
export function collectTaskIds(vaultRoot: string): Set<string> {
  const ids = new Set<string>();
  const files = fg.sync(["execution/tasks/**/*.md"], { cwd: vaultRoot, absolute: true });
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf-8");
    let m: RegExpExecArray | null;
    TASK_ID.lastIndex = 0;
    while ((m = TASK_ID.exec(txt)) !== null) {
      ids.add(m[2]);
    }
  }
  return ids;
}

/** Count task log files (for reporting). */
export function countTaskLogs(vaultRoot: string): number {
  return fg.sync(["execution/tasks/**/*.md"], { cwd: vaultRoot }).length;
}
