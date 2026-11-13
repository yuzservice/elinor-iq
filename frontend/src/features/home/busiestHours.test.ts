import { describe, expect, it } from "vitest";
import { cellAlpha, maxCell, peakText } from "./BusiestHoursSection";
import type { BusiestHours } from "./types";

const rows = (values: number[][]): BusiestHours["rows"] =>
  values.map((cells, weekday) => ({
    weekday,
    day: ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"][weekday],
    cells: cells.map((avg_sales, index) => ({ hour: index + 8, avg_sales })),
  }));

const data = (values: number[][], peak: BusiestHours["peak"] = null): BusiestHours => ({
  range: { from: "2026-09-19T00:00:00+03:30", to: "2026-11-14T00:00:00+03:30", is_selected_range: false, lines: ["ONLINE"] },
  rows: rows(values),
  peak,
});

describe("maxCell", () => {
  it("is the largest average across every day and hour", () => {
    expect(maxCell(data([[1, 9, 3], [4, 2, 0]]))).toBe(9);
  });

  it("is 0 when nothing sold", () => {
    expect(maxCell(data([[0, 0], [0, 0]]))).toBe(0);
    expect(maxCell(data([]))).toBe(0);
  });
});

describe("cellAlpha", () => {
  it("ramps from near-transparent to full at the busiest cell", () => {
    expect(cellAlpha(0, 100)).toBeCloseTo(0.06);
    expect(cellAlpha(100, 100)).toBeCloseTo(1);
    expect(cellAlpha(50, 100)).toBeCloseTo(0.53);
  });

  it("stays at the floor when every cell is empty", () => {
    expect(cellAlpha(0, 0)).toBeCloseTo(0.06);
  });
});

describe("peakText", () => {
  it("names the weekday and the hour span in Persian digits", () => {
    expect(peakText({ weekday: 4, day: "چهارشنبه", hour: 18, avg_sales: 9_000_000 })).toBe("اوج: چهارشنبه ساعت ۱۸ تا ۱۹");
    expect(peakText({ weekday: 0, day: "شنبه", hour: 8, avg_sales: 1 })).toBe("اوج: شنبه ساعت ۰۸ تا ۰۹");
  });

  it("is «—» without a peak", () => {
    expect(peakText(null)).toBe("—");
  });
});
