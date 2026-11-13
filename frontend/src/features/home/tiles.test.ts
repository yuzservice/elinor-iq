import { describe, expect, it } from "vitest";
import { donutStops, rankBranches, sparkBars, toggleLine } from "./tiles";
import type { HomeData } from "./types";

const row = (line: HomeData["branches"][number]["line"], sales: number) =>
  ({ line, sales, invoices: 1, items: 1, basket: sales, change: null, compare_sales: null });

describe("home branch tiles", () => {
  it("toggles the branch filter and keeps the other params", () => {
    const on = toggleLine(new URLSearchParams("period=7&compare=yoy"), "SARI");
    expect(on.get("line")).toBe("SARI");
    expect(on.get("period")).toBe("7");
    expect(toggleLine(on, "SARI").has("line")).toBe(false);
    expect(toggleLine(on, "GORGAN").get("line")).toBe("GORGAN");
  });

  it("ranks branches by sales with shares", () => {
    const ranked = rankBranches([row("ONLINE", 100), row("SARI", 300), row("CAPRI", 0)]);
    expect(ranked.map((b) => [b.line, b.rank])).toEqual([["SARI", 1], ["ONLINE", 2], ["CAPRI", 3]]);
    expect(ranked[0].share).toBeCloseTo(0.75);
    expect(rankBranches([row("SARI", 0)])[0].share).toBeNull();
  });

  it("builds donut stops and an empty ring", () => {
    expect(donutStops([{ color: "a", value: 1 }, { color: "b", value: 3 }])).toBe("a 0.0% 25.0%, b 25.0% 100.0%");
    expect(donutStops([{ color: "a", value: 0 }])).toBe("var(--chart-track) 0% 100%");
  });

  it("sums trend lines into at most 24 spark bars, future buckets null", () => {
    const trend = Array.from({ length: 72 }, (_, i) => ({ key: i, future: i >= 60, sales: i >= 60 ? null : 1, lines: i >= 60 ? undefined : { SARI: 1 } }));
    const bars = sparkBars(trend, "SARI");
    expect(bars).toHaveLength(24);
    expect(bars[0]).toBe(3);
    expect(bars[19]).toBe(3);
    expect(bars[20]).toBeNull();
    expect(sparkBars(trend.slice(0, 5), "SARI")).toEqual([1, 1, 1, 1, 1]);
  });
});
