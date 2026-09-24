import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatToman } from "./format";

describe("format", () => {
  it("formats numbers in Persian", () => {
    expect(formatNumber(1234)).toContain("۱");
  });

  it("keeps empty values calm", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatToman(undefined)).toBe("—");
  });

  it("uses jalali dates in the shared formatter", () => {
    expect(formatDate("2026-09-17")).toBe("۱۴۰۵/۰۶/۲۶");
  });
});
