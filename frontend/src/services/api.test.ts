import { describe, expect, it } from "vitest";
import { queryPath } from "./api";
import { customerListQuery } from "./customers";

describe("api client", () => {
  it("builds query strings without hardcoded domain URLs", () => {
    expect(queryPath("/customers/", { page: 2, search: "سارا" })).toContain("page=2");
    expect(queryPath("/home/summary/", { from: undefined })).toBe("/home/summary/");
  });

  it("keeps customer list filters server-side and omits empty values", () => {
    const path = customerListQuery({
      search: "0912",
      population: "all",
      tier: "VIP",
      channel: "physical",
      sales_line: "sari",
      min_purchases: "2",
      page: 3,
    });
    expect(path).toContain("/customers/?");
    expect(path).toContain("search=0912");
    expect(path).toContain("population=all");
    expect(path).toContain("tier=VIP");
    expect(path).toContain("channel=physical");
    expect(path).toContain("sales_line=sari");
    expect(path).toContain("min_purchases=2");
    expect(path).toContain("page=3");
    expect(path).toContain("per_page=20");
    expect(path).not.toContain("behavior=");
  });
});
