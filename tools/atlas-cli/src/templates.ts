// templates.ts — minimal body + frontmatter scaffolding for `atlas new` (RFC-002 §10).

import { generateId } from "./id.js";
import { TYPE_FOLDER } from "./types.js";

export interface NewKOOptions {
  type: string;
  title: string;
  date?: string; // YYYY-MM-DD
}

/** Build an ASCII kebab-case slug from a title (RFC-002 §4 naming convention). */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Folder (relative to vault root) for a given type. */
export function folderFor(type: string): string {
  const f = TYPE_FOLDER[type];
  if (!f) throw new Error(`No folder mapping for type "${type}"`);
  return f;
}

/** Filename for a KO. Temporal types get a YYYY-MM-DD prefix (RFC-002 §4.2). */
export function filenameFor(type: string, title: string, date: string): string {
  const slug = slugify(title);
  const temporal = new Set(["event", "decision", "initiative"]);
  if (type === "event" || type === "decision") {
    return `${date}-${slug}.md`;
  }
  if (type === "initiative") {
    const year = date.slice(0, 4);
    return `${year}-${slug}.md`;
  }
  void temporal;
  return `${slug}.md`;
}

/** Compose the full Markdown content for a new minimal KO. */
export function renderKO(opts: NewKOOptions): { id: string; content: string } {
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const id = generateId(opts.type);
  const fm = [
    "---",
    `id: ${id}`,
    `type: ${opts.type}`,
    `title: ${JSON.stringify(opts.title)}`,
    `lifecycle: fleeting`,
    `created: ${date}`,
    `aliases: []`,
    `tags: []`,
    `derived:`,
    `  managed_by: atlas-context-engine`,
    `  cached: false`,
    "---",
  ].join("\n");

  const body = bodyFor(opts.type, opts.title);
  return { id, content: `${fm}\n\n${body}\n` };
}

function bodyFor(type: string, title: string): string {
  switch (type) {
    case "policy":
      return `# ${title}\n\n## What it establishes\n\n## Why it exists\n\n## Risk it mitigates`;
    case "decision":
      return `# ${title}\n\n## Context\n\n## Decision\n\n## Alternatives considered\n\n## Consequences`;
    case "source":
      return `# ${title}\n\n## Summary\n\n## Key excerpts\n\n## Knowledge derived from this source`;
    case "prompt":
      return `# ${title}\n\n## When to use it\n\n## The prompt\n\n## Tasks where it worked`;
    case "agent":
      return `# ${title}\n\n## Role\n\n## Scope\n\n## Governing policies`;
    case "artifact":
      return `# ${title}\n\n## Content\n\n## Concepts it expresses\n\n## Publication`;
    default:
      // concept, insight, initiative, event, etc.
      return `# ${title}\n\n## Definition\n\n## Notes\n\n## Relations`;
  }
}
