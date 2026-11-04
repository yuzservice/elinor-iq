import { describe, expect, it } from "vitest";
import { formatDate } from "../../lib/format";
import { PROFILE_EMPTY, amountText, phoneGroups, compactAmount, daysAgo, joinFacts, profileValue, salesLineTone, tierCompareText } from "./customer360Display";

describe("customer 360 display", () => {
  it("uses a clear empty state instead of fabricated profile values", () => {
    expect(profileValue("")).toBe(PROFILE_EMPTY);
    expect(profileValue(null)).toBe(PROFILE_EMPTY);
    expect(profileValue("gold")).toBe("gold");
  });

  it("keeps sales-line labels distinct and jalali dates for purchase history", () => {
    expect(salesLineTone("ONLINE")).toBe("accent");
    expect(salesLineTone("SARI")).toBe("sage");
    expect(salesLineTone("GORGAN")).toBe("warning");
    expect(salesLineTone("CAPRI")).toBe("neutral");
    expect(joinFacts(["مشکی", "کرم"])).toBe("مشکی، کرم");
    expect(joinFacts([])).toBe(PROFILE_EMPTY);
    expect(formatDate("2026-09-17T12:30:00+03:30")).toBe("۱۴۰۵/۰۶/۲۶");
  });

  it("formats value cards", () => {
    expect(compactAmount(87_500_000)).toEqual({ value: "۸۷٫۵", unit: "میلیون" });
    expect(compactAmount(950_000)).toEqual({ value: "۹۵۰", unit: "هزار" });
    expect(compactAmount(null)).toEqual({ value: "—", unit: "" });
    expect(amountText(4_200_000)).toBe("۴٫۲ میلیون تومان");
    expect(amountText(4_200_000, false)).toBe("۴٫۲ میلیون");
    expect(tierCompareText(20, "طلایی ۱")).toEqual({ text: "۲۰٪ بیشتر از میانگین طلایی ۱", sign: 1 });
    expect(tierCompareText(-3, "نقره‌ای")).toEqual({ text: "۳٪ کمتر از میانگین نقره‌ای", sign: -1 });
    expect(tierCompareText(null, "نقره‌ای")).toBeNull();
    expect(daysAgo(0)).toBe("امروز");
    expect(daysAgo(45)).toBe("۴۵ روز پیش");
    expect(phoneGroups("09120000027")).toBe("0912 000 0027");
    expect(phoneGroups("+98912")).toBe("+98912");
  });
});
