import { describe, expect, it } from "vitest";
import { bandColor, clock, code, compact, fa, percent, scoreBand, scoreText } from "./format";

describe("pulse formatting", () => {
  it("formats numbers in Persian, compact", () => {
    expect(compact(221_000)).toBe("۲۲۱ هزار");
    expect(compact(42_100)).toBe("۴۲٫۱ هزار");
    expect(compact(1_240_000)).toBe("۱٫۲ میلیون");
    expect(compact(950)).toBe("۹۵۰");
    expect(compact(null)).toBe("—");
    expect(fa(3_999_000)).toBe("۳٬۹۹۹٬۰۰۰");
    expect(percent(79.2)).toBe("۷۹٪");
    expect(percent(2.12, 2)).toBe("۲٫۱۲٪");
    expect(clock({ hour: 9, minute: 5 })).toBe("۰۹:۰۵");
  });

  it("shows product codes as plain digits", () => {
    expect(code("8504")).toBe("۸۵۰۴");
    expect(code("1042")).not.toContain("٬");
  });

  it("maps scores to the four colours", () => {
    expect([1.5, 1.49, 1, 0.99, 0.7, 0.69, null].map(scoreBand)).toEqual(["great", "good", "good", "mid", "mid", "bad", null]);
    expect(bandColor("great")).toBe("var(--s-great)");
    expect(bandColor(null)).toBe("var(--text-faint)");
    expect(scoreText(2.54)).toBe("۲٫۵×");
  });
});
