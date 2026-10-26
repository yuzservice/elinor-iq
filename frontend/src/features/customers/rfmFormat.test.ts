import { describe, expect, it } from "vitest";
import type { RfmMatrixCell } from "../../types";
import { customersTab, formatDelta, formatKpiValue, formatSigned, matrixCellValue, matrixTooltip, sparklinePath } from "./rfmFormat";

const cell: RfmMatrixCell = {
  r: 4,
  f: 4,
  segment: "loyal",
  segment_label: "وفاداران",
  r_label: "۳۱ تا ۹۰ روز",
  f_label: "۴ تا ۵ خرید",
  count: 2526,
  pct_customers: 1.3,
  lifetime_amount_sum: 18_000_000_000,
  pct_lifetime_amount: 6.2,
  amount_12m_sum: 9_000_000_000,
  high_value_count: 812,
  avg_days_since_last: 54.4,
};

describe("formatters", () => {
  it("formats KPI values by unit", () => {
    expect(formatKpiValue(1234, "count")).toBe("۱٬۲۳۴");
    expect(formatKpiValue(20.8, "percent")).toBe("۲۰٫۸٪");
    expect(formatKpiValue(null, "count")).toBe("—");
  });

  it("formats deltas with direction and month", () => {
    expect(formatDelta(3.2, "مهر ۱۴۰۵")).toEqual({ text: "▲ ۳٫۲٪ نسبت به مهر ۱۴۰۵", direction: "up" });
    expect(formatDelta(-25.9, "مهر")?.direction).toBe("down");
    expect(formatDelta(null, "مهر")).toBeNull();
    expect(formatSigned(120)).toBe("+۱۲۰");
    expect(formatSigned(-42)).toBe("−۴۲");
  });
});

describe("sparklinePath", () => {
  it("scales values into the box and breaks at gaps", () => {
    expect(sparklinePath([1, 3], 100, 20, 0)).toBe("M0.0 20.0 L100.0 0.0");
    expect(sparklinePath([1, null, 1, 3], 30, 10, 0)).toBe("M0.0 10.0 M20.0 10.0 L30.0 0.0");
    expect(sparklinePath([5], 100, 20)).toBe("");
    expect(sparklinePath([null, null], 100, 20)).toBe("");
  });
});

describe("matrix", () => {
  it("builds the two-line tooltip", () => {
    const [first, second] = matrixTooltip(cell);
    expect(first).toBe("وفاداران · آخرین خرید ۳۱ تا ۹۰ روز پیش · ۴ تا ۵ خرید");
    expect(second).toContain("۲٬۵۲۶ مشتری (۱٫۳٪)");
    expect(second).toContain("پرارزش ۸۱۲");
    expect(second).toContain("میانگین ۵۴ روز");
  });

  it("shows the chosen metric", () => {
    expect(matrixCellValue(cell, "count")).toBe("۲٬۵۲۶");
    expect(matrixCellValue(cell, "share")).toBe("۶٫۲٪");
  });
});

describe("customers tabs", () => {
  it("routes tabs from the URL", () => {
    expect(customersTab("")).toBe("rfm");
    expect(customersTab("?tab=calls")).toBe("calls");
    expect(customersTab("?tab=list&rfm_segment=new")).toBe("list");
    expect(customersTab("?tab=unknown")).toBe("rfm");
  });
});
