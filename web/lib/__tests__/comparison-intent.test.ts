import { describe, expect, it } from "vitest";
import {
  comparisonIntentNote,
  comparisonPlanIds,
  selectedPlanIntent,
  withComparisonPlans,
} from "@/lib/comparison-intent";

describe("comparison intent", () => {
  it("de-duplicates, allowlists and caps shared plan ids", () => {
    expect(
      comparisonPlanIds("?plans=a,b,a,junk,c,d", new Set(["a", "b", "c", "d"])),
    ).toEqual(["a", "b", "c"]);
  });

  it("updates only the shortlist query parameter", () => {
    expect(withComparisonPlans("?ref=SW-7KQ4M9&plans=old", ["a", "b"])).toBe(
      "?ref=SW-7KQ4M9&plans=a%2Cb",
    );
    expect(withComparisonPlans("?ref=x&plans=old", [])).toBe("?ref=x");
  });

  it("resolves trusted catalogue context for the CRM note", () => {
    const options = [
      { id: "a", provider: "סלקום", name: "מסלול A" },
      { id: "b", provider: "פרטנר", name: "מסלול B" },
    ];
    const selected = selectedPlanIntent("?plans=b,unknown,a", options);
    expect(selected.map((item) => item.id)).toEqual(["b", "a"]);
    expect(comparisonIntentNote(selected)).toContain("פרטנר — מסלול B (b)");
  });
});
