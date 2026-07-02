// relations.ts — extract and validate typed strong relations from frontmatter (RFC-002 §6).

import { ALL_RELATIONS, SCALAR_RELATIONS, type RelationTarget } from "./types.js";

export interface ExtractedRelation {
  key: string;
  index: number;
  target_id?: string;
  raw: unknown;
}

const WIKILINK = /^\s*\[\[.*\]\]\s*$/;

/** Returns true if a value is a bare wikilink string (forbidden as strong-relation source). */
export function isWikilinkString(v: unknown): boolean {
  return typeof v === "string" && WIKILINK.test(v);
}

/**
 * Extract all strong relations present in a frontmatter object.
 * - Array relations (deriva_de, se_apoya_en, ...) -> list of {target_id, ...}
 * - Scalar relations (escrito_por, respaldado_por, validado_por) -> single string ref
 * Returns extracted entries plus structural errors found while extracting.
 */
export function extractRelations(fm: Record<string, unknown>): {
  relations: ExtractedRelation[];
  errors: string[];
} {
  const relations: ExtractedRelation[] = [];
  const errors: string[] = [];

  for (const key of ALL_RELATIONS) {
    if (!(key in fm)) continue;
    const value = fm[key];

    if (SCALAR_RELATIONS.has(key)) {
      // scalar: a string id, or "human", or an array of those
      const vals = Array.isArray(value) ? value : [value];
      vals.forEach((v, i) => {
        if (isWikilinkString(v)) {
          errors.push(`relation ${key}[${i}] uses a wikilink; strong relations must use ids, not [[...]]`);
        } else if (typeof v !== "string") {
          errors.push(`relation ${key}[${i}] must be a string id (or "human"), got ${typeof v}`);
        }
      });
      continue;
    }

    // array relation
    if (!Array.isArray(value)) {
      errors.push(`relation ${key} must be a list, got ${typeof value}`);
      continue;
    }

    value.forEach((item, i) => {
      if (isWikilinkString(item)) {
        errors.push(
          `relation ${key}[${i}] is a bare wikilink; strong relations must use { target_id }, not [[...]]`,
        );
        relations.push({ key, index: i, raw: item });
        return;
      }
      if (typeof item !== "object" || item === null) {
        errors.push(`relation ${key}[${i}] must be an object with target_id`);
        relations.push({ key, index: i, raw: item });
        return;
      }
      const obj = item as Record<string, unknown>;
      const tid = obj.target_id;
      if (typeof tid !== "string" || tid.length === 0) {
        errors.push(`relation ${key}[${i}] is missing a valid target_id`);
        relations.push({ key, index: i, raw: item });
        return;
      }
      relations.push({ key, index: i, target_id: tid, raw: item });
    });
  }

  return { relations, errors };
}

/** Collect the deriva_de evidence ids referenced inside relation entries (for agent falsifiability checks). */
export function evidenceIds(rel: RelationTarget): string[] {
  return Array.isArray(rel.deriva_de) ? rel.deriva_de : [];
}
