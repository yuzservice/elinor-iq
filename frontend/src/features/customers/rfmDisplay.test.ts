import { describe, expect, it } from "vitest";
import { buildCustomerListParams, filtersFromSearch } from "./customerListFilters";
import { RFM_SEGMENTS, clubRedirect, rfmSegment, segmentForCell } from "./rfmDisplay";

const EXPECTED: Record<number, Record<number, string>> = {
  5: { 5: "champions", 4: "champions", 3: "potential", 2: "potential", 1: "new" },
  4: { 5: "champions", 4: "loyal", 3: "potential", 2: "potential", 1: "new" },
  3: { 5: "loyal", 4: "loyal", 3: "attention", 2: "attention", 1: "attention" },
  2: { 5: "cant_lose", 4: "at_risk", 3: "at_risk", 2: "hibernating", 1: "hibernating" },
  1: { 5: "cant_lose", 4: "at_risk", 3: "at_risk", 2: "hibernating", 1: "hibernating" },
};

describe("RFM segments", () => {
  it("maps all 25 R×F cells like the backend", () => {
    for (const r of [1, 2, 3, 4, 5]) {
      for (const f of [1, 2, 3, 4, 5]) {
        expect(segmentForCell(r, f)).toBe(EXPECTED[r][f]);
      }
    }
  });

  it("knows the 8 segments in backend order", () => {
    expect(RFM_SEGMENTS.map((segment) => segment.key)).toEqual([
      "champions",
      "loyal",
      "potential",
      "new",
      "attention",
      "at_risk",
      "cant_lose",
      "hibernating",
    ]);
    expect(rfmSegment("at_risk")?.label).toBe("در خطر");
    expect(rfmSegment("unknown")).toBeNull();
  });
});

describe("customers page links", () => {
  it("redirects old campaign and tier-rule links to the club page", () => {
    expect(clubRedirect("?tab=campaigns")).toBe("/club?tab=campaigns");
    expect(clubRedirect("?tierRules=1")).toBe("/club?tierRules=1");
    expect(clubRedirect("?tab=list")).toBeNull();
    expect(clubRedirect("")).toBeNull();
  });

  it("reads segment, score and tier filters from the URL", () => {
    const segment = filtersFromSearch("?tab=list&rfm_segment=at_risk");
    expect(segment.rfmSegment).toBe("at_risk");
    expect(segment.sort).toBe("rfm");
    const cell = filtersFromSearch("?tab=list&r_score=2&f_score=5");
    expect(buildCustomerListParams(cell, "")).toMatchObject({ r_score: "2", f_score: "5", sort: "rfm" });
    expect(filtersFromSearch("?r_score=9").rScore).toBe("");
    expect(filtersFromSearch("?tier=gold_1").tier).toBe("GOLD_1");
  });
});
