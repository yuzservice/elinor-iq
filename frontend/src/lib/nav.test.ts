import { describe, expect, it } from "vitest";
import { DATA_COVERAGE_MESSAGE, NAV_ITEMS, PRODUCT_NAV_LABEL, showsSettings, visibleNavItems } from "./nav";

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

  it("merges the sales page into home: one «فروش» item on «/»", () => {
    expect(NAV_ITEMS.map((item) => item.to)).not.toContain("/sales");
    expect(NAV_ITEMS.filter((item) => item.label === "فروش")).toHaveLength(1);
    expect(NAV_ITEMS.find((item) => item.to === "/")?.label).toBe("فروش");
    expect(NAV_ITEMS.some((item) => (item.label as string) === "خانه")).toBe(false);
  });
});

const keys = (user: Parameters<typeof visibleNavItems>[0]) => visibleNavItems(user).map((item) => item.key);

describe("nav visibility", () => {
  it("shows Pulse only with the feature", () => {
    expect(keys({ role: "admin", features: { pulse: true } })).toContain("pulse");
    expect(keys({ role: "admin", features: { pulse: false } })).not.toContain("pulse");
    expect(keys({ role: "manager" })).not.toContain("pulse");
  });

  it("limits the content team to Pulse and agents to calls", () => {
    expect(keys({ role: "content", features: { pulse: true } })).toEqual(["pulse"]);
    expect(keys({ role: "content", features: { pulse: false } })).toEqual([]);
    expect(keys({ role: "sales_agent", features: { pulse: true } })).toEqual(["calls"]);
    expect(showsSettings({ role: "content" })).toBe(false);
    expect(showsSettings({ role: "sales_agent" })).toBe(false);
    expect(showsSettings({ role: "admin" })).toBe(true);
  });
});
