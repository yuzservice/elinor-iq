import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, apiParams, clearFilters, isFiltered, parseState, serializeState, toggleList } from "./productsUrl";

describe("products URL state", () => {
  it("round-trips every field and omits defaults", () => {
    expect(serializeState(DEFAULT_STATE)).toBe("");
    const state = {
      ...DEFAULT_STATE, period: "custom" as const, from: "2026-10-01", to: "2026-10-31", compare: "year" as const, q: "مانتو",
      category_ids: [3, 12], lines: ["SARI"], status: ["driver", "growth"], stock: ["charge"], sort: "speed", dir: "asc" as const,
      page: 3, bch: "online" as const, blev: "category" as const, bnew: true,
    };
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it("drops invalid values and incomplete custom ranges", () => {
    const state = parseState("period=custom&from=2026-10-01&compare=custom&cfrom=x&category_ids=1,a,-2&page=0&bch=moon");
    expect(state.period).toBe("30");
    expect(state.compare).toBe("prev");
    expect(state.category_ids).toEqual([1]);
    expect(state.page).toBe(1);
    expect(state.bch).toBe("all");
  });

  it("filters switch to the full list; period and sort do not", () => {
    expect(isFiltered({ ...DEFAULT_STATE, period: "90", sort: "speed" })).toBe(false);
    expect(isFiltered({ ...DEFAULT_STATE, lines: ["CAPRI"] })).toBe(true);
    expect(isFiltered(clearFilters({ ...DEFAULT_STATE, status: ["slow"], q: "x", all: true }))).toBe(false);
  });

  it("cards toggle their filter and API params carry only what is set", () => {
    const on = toggleList({ ...DEFAULT_STATE, page: 4 }, "status", ["driver"]);
    expect(on.status).toEqual(["driver"]);
    expect(on.page).toBe(1);
    expect(toggleList(on, "status", ["driver"]).status).toEqual([]);
    const params = apiParams({ ...DEFAULT_STATE, status: ["slow", "stale"] });
    expect(params.status).toBe("slow,stale");
    expect(params.from).toBeUndefined();
  });
});
