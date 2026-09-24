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

  it("adds Smart Direct as a main nav item", () => {
    expect(NAV_ITEMS.find((item) => item.to === "/smart-direct")?.label).toBe("دایرکت هوشمند");
    expect(NAV_ITEMS.some((item) => item.label.includes("اینباکس") || item.label.includes("پیام‌ها"))).toBe(false);
  });
});
