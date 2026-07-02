// id.ts — stable ID generation (ULID with legible prefix). RFC-002 / P0 decision.

import { ulid } from "ulid";
import { ID_PREFIX, ALL_PREFIXES } from "./types.js";

/** Generate a new Atlas ID for a given type, e.g. concept -> "ko_01JZ...". */
export function generateId(type: string): string {
  const prefix = ID_PREFIX[type];
  if (!prefix) {
    throw new Error(
      `Unknown type "${type}". Known types: ${Object.keys(ID_PREFIX).join(", ")}`,
    );
  }
  return prefix + ulid();
}

/** True if the id starts with one of the known Atlas prefixes. */
export function hasValidPrefix(id: string): boolean {
  return ALL_PREFIXES.some((p) => id.startsWith(p));
}

/** Returns the expected prefix for a type, or undefined if the type is unknown. */
export function expectedPrefix(type: string): string | undefined {
  return ID_PREFIX[type];
}

/** Validate that an id's prefix matches the expected prefix for its declared type. */
export function prefixMatchesType(id: string, type: string): boolean {
  const expected = ID_PREFIX[type];
  if (!expected) return false;
  return id.startsWith(expected);
}
