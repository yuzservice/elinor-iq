import { describe, expect, it } from "vitest";
import { DATA_COVERAGE_MESSAGE, NAV_ITEMS, PRODUCT_NAV_LABEL } from "./nav";

describe("product scope and coverage", () => {
  it("renames products nav and removes inventory", () => {
    expect(PRODUCT_NAV_LABEL).toBe("محصولات");
    expect(NAV_ITEMS.map((item) => item.label)).not.toContain("کالا و موجودی");
    expect(NAV_ITEMS.some((item) => item.label.includes("موجودی"))).toBe(false);
    expect(NAV_ITEMS.find((item) => item.to === "/products")?.label).toBe("محصولات");
  });

  it("exposes the partial data notice", () => {
    expect(DATA_COVERAGE_MESSAGE).toBe("داده فعلی: بخشی از سفارش‌های اخیر الینور");
  });

  it("does not expose a direct-messaging nav item", () => {
    expect(NAV_ITEMS.map((item) => item.to)).not.toContain("/smart-direct");
    expect(NAV_ITEMS.some((item) => item.label.includes("دایرکت"))).toBe(false);
  });
});
