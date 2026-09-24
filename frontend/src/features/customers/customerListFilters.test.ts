import { describe, expect, it } from "vitest";
import { describeCustomerFilters, EMPTY_CUSTOMER_FILTERS, salesLinesToParam } from "./customerListFilters";

describe("customerListFilters", () => {
  it("serializes selected sales lines for the API", () => {
    expect(salesLinesToParam(["sari", "gorgan"])).toBe("sari,gorgan");
  });

  it("describes advanced filters without repeating the visible controls", () => {
    expect(
      describeCustomerFilters({
        ...EMPTY_CUSTOMER_FILTERS,
        tier: "VIP",
        salesLines: ["sari", "online"],
        minPurchases: "2",
      }),
    ).toEqual(["حداقل 2 خرید"]);
  });
});
