import { describe, expect, it } from "vitest";
import { deriveSalesLineFilter, hasActiveSalesFilters, EMPTY_SALES_FILTERS, selectionLabel } from "./salesPageFilters";

describe("deriveSalesLineFilter", () => {
  it("returns all when nothing or multiple branches are selected", () => {
    expect(deriveSalesLineFilter([])).toBe("all");
    expect(deriveSalesLineFilter(["SARI", "GORGAN"])).toBe("all");
  });

  it("returns the selected sales line", () => {
    expect(deriveSalesLineFilter(["ONLINE"])).toBe("ONLINE");
    expect(deriveSalesLineFilter(["GORGAN"])).toBe("GORGAN");
  });
});

describe("hasActiveSalesFilters", () => {
  it("detects active filters", () => {
    expect(hasActiveSalesFilters(EMPTY_SALES_FILTERS)).toBe(false);
    expect(hasActiveSalesFilters({ ...EMPTY_SALES_FILTERS, payments: ["online:digipay"] })).toBe(true);
  });
});

describe("selectionLabel", () => {
  it("shows all label when empty", () => {
    expect(selectionLabel([], [{ key: "SARI", label: "ساری" }], "همه شعبه‌ها")).toBe("همه شعبه‌ها");
  });

  it("shows count for multiple selections", () => {
    expect(
      selectionLabel(
        ["SARI", "GORGAN"],
        [
          { key: "SARI", label: "ساری" },
          { key: "GORGAN", label: "گرگان" },
        ],
        "همه شعبه‌ها",
      ),
    ).toBe("2 مورد");
  });
});
