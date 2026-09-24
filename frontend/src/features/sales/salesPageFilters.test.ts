import { describe, expect, it } from "vitest";
import {
  deriveSalesLineFilter,
  hasActiveSalesFilters,
  isBranchFilterDisabled,
  EMPTY_SALES_FILTERS,
  selectionLabel,
} from "./salesPageFilters";

describe("deriveSalesLineFilter", () => {
  it("returns all when nothing is selected", () => {
    expect(deriveSalesLineFilter([], [])).toBe("all");
  });

  it("returns ONLINE for online-only channels", () => {
    expect(deriveSalesLineFilter([], ["shopino"])).toBe("ONLINE");
    expect(deriveSalesLineFilter(["SARI"], ["website"])).toBe("ONLINE");
  });

  it("returns branch when one branch is selected for physical view", () => {
    expect(deriveSalesLineFilter(["GORGAN"], [])).toBe("GORGAN");
    expect(deriveSalesLineFilter(["CAPRI"], ["pos"])).toBe("CAPRI");
  });
});

describe("isBranchFilterDisabled", () => {
  it("disables branch filter for online-only channels", () => {
    expect(isBranchFilterDisabled(["website"])).toBe(true);
    expect(isBranchFilterDisabled(["pos"])).toBe(false);
    expect(isBranchFilterDisabled([])).toBe(false);
  });
});

describe("hasActiveSalesFilters", () => {
  it("detects active filters", () => {
    expect(hasActiveSalesFilters(EMPTY_SALES_FILTERS)).toBe(false);
    expect(
      hasActiveSalesFilters({
        ...EMPTY_SALES_FILTERS,
        payments: ["online:digipay"],
      }),
    ).toBe(true);
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
