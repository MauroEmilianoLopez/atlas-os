import { describe, it, expect } from "vitest";
import { generateId, hasValidPrefix, prefixMatchesType } from "../src/id.js";

describe("id generation", () => {
  it("generates ids with the correct prefix per type", () => {
    expect(generateId("concept")).toMatch(/^ko_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(generateId("insight")).toMatch(/^ko_/);
    expect(generateId("agent")).toMatch(/^agent_/);
    expect(generateId("task")).toMatch(/^task_/);
    expect(generateId("policy")).toMatch(/^policy_/);
  });

  it("rejects unknown types", () => {
    expect(() => generateId("nonsense")).toThrow();
  });

  it("validates prefixes and prefix-type matching", () => {
    const id = generateId("concept");
    expect(hasValidPrefix(id)).toBe(true);
    expect(hasValidPrefix("xyz_123")).toBe(false);
    expect(prefixMatchesType(id, "concept")).toBe(true);
    expect(prefixMatchesType(id, "agent")).toBe(false);
  });
});
