import { describe, it, expect } from "vitest";
import { extractRelations, isWikilinkString } from "../src/relations.js";

describe("relations", () => {
  it("validates a correct strong relation", () => {
    const fm = {
      se_apoya_en: [
        { target_id: "ko_abc", label: "X", deriva_de: ["ko_ev"], escrito_por: "agent_1" },
      ],
    };
    const { relations, errors } = extractRelations(fm);
    expect(errors).toHaveLength(0);
    expect(relations).toHaveLength(1);
    expect(relations[0].target_id).toBe("ko_abc");
    expect(relations[0].key).toBe("se_apoya_en");
  });

  it("accepts the short form (target_id + label only)", () => {
    const { errors } = extractRelations({ trata_sobre: [{ target_id: "ko_x", label: "L" }] });
    expect(errors).toHaveLength(0);
  });

  it("detects a wikilink used incorrectly as a strong relation", () => {
    const fm = { se_apoya_en: ["[[backpressure]]"] };
    const { errors } = extractRelations(fm);
    expect(errors.some((e) => /wikilink/.test(e))).toBe(true);
  });

  it("flags a missing target_id", () => {
    const { errors } = extractRelations({ contradice: [{ label: "no id" }] });
    expect(errors.some((e) => /missing a valid target_id/.test(e))).toBe(true);
  });

  it("identifies bare wikilink strings", () => {
    expect(isWikilinkString("[[x]]")).toBe(true);
    expect(isWikilinkString("ko_1")).toBe(false);
  });
});
