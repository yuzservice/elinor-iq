import { describe, expect, it } from "vitest";
import { formatJalali, jalaliToIso, jalaliWeekday, toJalaliParts } from "./dates";

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

describe("jalaliWeekday", () => {
  it("names the real weekday of known dates", () => {
    expect(jalaliWeekday("2026-11-11")).toBe("چهارشنبه"); // 1405/08/20
    expect(jalaliWeekday("2026-11-06")).toBe("جمعه"); // 1405/08/15
    expect(jalaliWeekday("2025-03-21")).toBe("جمعه"); // 1404/01/01
    expect(jalaliWeekday("2026-11-11T23:30:00+03:30")).toBe("چهارشنبه"); // late evening in Tehran
    expect(jalaliWeekday("2026-11-10T21:00:00Z")).toBe("چهارشنبه"); // 00:30 Wednesday in Tehran
  });
});
