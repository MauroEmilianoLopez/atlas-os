// parser.ts — read Markdown files and split frontmatter / body robustly.

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import yaml from "js-yaml";
import type { ParsedFile } from "./types.js";

/** Parse a single Markdown file into frontmatter + body. Throws on invalid YAML. */
export function parseFile(absPath: string, root: string): ParsedFile {
  const raw = fs.readFileSync(absPath, "utf-8");
  const relPath = path.relative(root, absPath).split(path.sep).join("/");

  // Detect frontmatter fence ourselves so we can throw a clean error on bad YAML,
  // instead of gray-matter silently swallowing it.
  const hasFence = /^---\r?\n/.test(raw);
  if (!hasFence) {
    return { path: absPath, relPath, hasFrontmatter: false, frontmatter: {}, body: raw };
  }

  let parsed;
  try {
    parsed = matter(raw, {
      engines: {
        // Use js-yaml in strict mode so malformed YAML throws.
        yaml: (s: string) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object,
      },
    });
  } catch (e) {
    throw new Error(`Invalid YAML frontmatter in ${relPath}: ${(e as Error).message}`);
  }

  return {
    path: absPath,
    relPath,
    hasFrontmatter: true,
    frontmatter: (parsed.data ?? {}) as Record<string, unknown>,
    body: parsed.content ?? "",
  };
}

/** Find all .md files under a root (excluding .atlas generated dirs). */
export function findMarkdown(root: string): string[] {
  return fg
    .sync(["**/*.md"], {
      cwd: root,
      absolute: true,
      ignore: ["**/.atlas/index/**", "**/.atlas/cache/**"],
    })
    .sort();
}
