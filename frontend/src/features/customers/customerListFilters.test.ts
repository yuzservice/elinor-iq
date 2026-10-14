import { describe, expect, it } from "vitest";
import {
  buildCustomerListParams,
  describeCustomerFilters,
  EMPTY_CUSTOMER_FILTERS,
  hasActiveCustomerFilters,
  salesLinesToParam,
} from "./customerListFilters";

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

  it("builds extended query parameters including branch match mode, LTV, payment, size, category, and city", () => {
    const params = buildCustomerListParams(
      {
        ...EMPTY_CUSTOMER_FILTERS,
        salesLines: ["sari", "gorgan"],
        salesLinesMode: "any",
        minAmount: "5000000",
        paymentMethod: "installment",
        size: "XL",
        category: "مانتو",
        city: "گرگان",
        profileState: "complete",
        sort: "lifetime_amount",
      },
      "سارا",
      { page: 2, perPage: 20 },
    );

    expect(params).toEqual({
      search: "سارا",
      population: undefined,
      tier: undefined,
      channel: undefined,
      sales_lines: "sari,gorgan",
      sales_lines_mode: "any",
      min_purchases: undefined,
      max_purchases: undefined,
      min_amount: "5000000",
      max_amount: undefined,
      last_from: undefined,
      last_to: undefined,
      first_from: undefined,
      first_to: undefined,
      payment_method: "installment",
      has_discount: undefined,
      order_behavior: undefined,
      size: "XL",
      category: "مانتو",
      city: "گرگان",
      profile_state: "complete",
      sort: "lifetime_amount",
      page: 2,
      per_page: 20,
    });
  });

  it("detects active filters across all filter categories", () => {
    expect(hasActiveCustomerFilters(EMPTY_CUSTOMER_FILTERS)).toBe(false);
    expect(hasActiveCustomerFilters({ ...EMPTY_CUSTOMER_FILTERS, paymentMethod: "snappay" })).toBe(true);
    expect(hasActiveCustomerFilters({ ...EMPTY_CUSTOMER_FILTERS, size: "M" })).toBe(true);
    expect(hasActiveCustomerFilters({ ...EMPTY_CUSTOMER_FILTERS, minAmount: "2000000" })).toBe(true);
  });
});
