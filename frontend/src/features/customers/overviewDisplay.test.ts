import { describe, expect, it } from "vitest";
import { barWidth, deltaText, insightTexts, metricDelta, metricValue, sparkSegments, tierNetText } from "./overviewDisplay";
import type { CustomerOverviewData, OverviewLensData } from "../../types";

const lens = (patch: Partial<OverviewLensData> = {}): OverviewLensData => ({
  customers: { value: 1200, new: 35 },
  active: { value: 400, delta: 6.2 },
  basket: { value: 3_850_000, delta: -2.3 },
  repeat: { value: 31.4, delta: 1.8 },
  spark: { customers: [], active: [], basket: [], repeat: [] },
  ...patch,
});

describe("customer overview formatting", () => {
  it("formats values in Persian digits with the reference units", () => {
    expect(metricValue("customers", 199266)).toBe("۱۹۹٬۲۶۶");
    expect(metricValue("basket", 3_850_000)).toBe("۳٬۸۵۰");
    expect(metricValue("repeat", 31.4)).toBe("۳۱٪");
    expect(metricValue("active", null)).toBe("—");
  });

  it("shows ▲/▼ percent, percentage points for repeat, and new buyers for customers", () => {
    expect(deltaText(6.2)).toBe("▲ ۶٫۲٪");
    expect(deltaText(-12.2)).toBe("▼ ۱۲٫۲٪");
    expect(metricDelta("repeat", lens())).toEqual({ text: "▲ ۱٫۸ واحد", up: true, title: "" });
    expect(metricDelta("customers", lens())).toEqual({ text: "+۳۵ جدید", up: true, title: "" });
    expect(metricDelta("active", lens({ active: { value: 3, delta: null } }))).toEqual({
      text: "—",
      up: null,
      title: "داده مقایسه کافی نیست",
    });
  });

  it("draws the sparkline oldest-left and breaks it on missing buckets", () => {
    const [first, second] = sparkSegments([null, 1, 2, null, 4, 5]);
    expect(first.startsWith("20.4,31.0")).toBe(true);
    expect(second.endsWith("94.0,3.0")).toBe(true);
    expect(sparkSegments([null, null])).toEqual([]);
  });

  it("sizes bars and tier deltas like the reference", () => {
    expect(barWidth(5, 1000)).toBe(2);
    expect(barWidth(500, 1000)).toBe(50);
    expect(barWidth(null, 1000)).toBe(0);
    expect(tierNetText(-18)).toBe("−۱۸");
    expect(tierNetText(310)).toBe("+۳۱۰");
  });

  it("builds the three insight sentences and skips missing ones", () => {
    const data = {
      insights: {
        best_active: { lens: "capri", delta: 18.7 },
        worst_active: { lens: "digipay", delta: -12.2 },
        top_tier: null,
      },
    } as unknown as CustomerOverviewData;
    expect(insightTexts(data).map((row) => row.text)).toEqual([
      "بیشترین رشد خریدار فعال: کاپری ▲ ۱۸٫۷٪",
      "بیشترین افت خریدار فعال: دیجی‌پی ▼ ۱۲٫۲٪",
    ]);
  });
});
