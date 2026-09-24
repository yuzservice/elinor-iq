import { describe, expect, it } from "vitest";
import { formatJalali, jalaliToIso, toJalaliParts } from "./dates";

describe("jalali dates", () => {
  it("formats 2026-09-17 as 26 Shahrivar 1405", () => {
    const parts = toJalaliParts("2026-09-17");
    expect(parts).toEqual({ jy: 1405, jm: 6, jd: 26 });
    expect(formatJalali("2026-09-17")).toBe("۱۴۰۵/۰۶/۲۶");
    expect(formatJalali("2026-09-17", "long")).toBe("۲۶ شهریور ۱۴۰۵");
  });

  it("converts jalali back to gregorian iso", () => {
    expect(jalaliToIso(1405, 6, 26)).toBe("2026-09-17");
  });

  it("keeps empty values calm", () => {
    expect(formatJalali(null)).toBe("—");
    expect(formatJalali("")).toBe("—");
  });
});
