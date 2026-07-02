// schemas.ts — zod schemas for the common frontmatter contract (RFC-002 §5).

import { z } from "zod";
import { KO_TYPES, LIFECYCLE } from "./types.js";

export const derivedSchema = z.object({
  managed_by: z.string().min(1),
  cached: z.boolean(),
});

// Common required fields for every Knowledge Object.
// Extra keys (relations, optional human fields) are allowed via .passthrough().
export const commonFrontmatter = z
  .object({
    id: z.string().min(1),
    type: z.enum(KO_TYPES),
    title: z.union([z.string().min(1), z.number()]).transform(String),
    lifecycle: z.enum(LIFECYCLE),
    created: z.union([z.string().min(1), z.date()]).transform(String),
    derived: derivedSchema,
  })
  .passthrough();

// Non-KO frontmatter files we tolerate without full validation (e.g. daily notes, task logs).
// Their `type` is allowed but they are not required to carry the full KO contract.
export const NON_KO_TYPES = new Set<string>(["daily", "map", "task_log"]);
