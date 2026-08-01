import { describe, it, expect } from "vitest";
import { SystemClock } from "../src/adapters/system-clock.js";

describe("SystemClock", () => {
  it("returns an ISO-8601 timestamp", () => {
    const clock = new SystemClock();
    expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
