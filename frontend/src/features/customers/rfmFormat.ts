import { formatCompactToman, formatNumber, formatPercent } from "../../lib/format";
import type { RfmKpi, RfmMatrixCell } from "../../types";

/** KPI value in its unit. */
export function formatKpiValue(value: number | null | undefined, unit: RfmKpi["unit"]): string {
  if (value == null) return "—";
  if (unit === "percent") return formatPercent(value);
  if (unit === "toman") return formatCompactToman(value);
  return formatNumber(value);
}

/** «▲ ۳٫۲٪ نسبت به مهر ۱۴۰۵» or null when there is no previous month to compare with. */
export function formatDelta(delta: number | null | undefined, previousLabel: string): { text: string; direction: "up" | "down" | "flat" } | null {
  if (delta == null) return null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "•";
  return { text: `${arrow} ${formatPercent(Math.abs(delta))} نسبت به ${previousLabel}`, direction };
}

/** Signed count, e.g. «+۱۲۰» / «−۴۲» / «۰». */
export function formatSigned(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value > 0) return `+${formatNumber(value)}`;
  if (value < 0) return `−${formatNumber(Math.abs(value))}`;
  return formatNumber(0);
}

/**
 * SVG path for a sparkline in a width × height box. Missing values break the line
 * (a new "M" starts after a gap). Returns "" with fewer than two points.
 */
export function sparklinePath(values: (number | null)[], width: number, height: number, padding = 2): string {
  const present = values.filter((value): value is number => value != null);
  if (present.length < 2) return "";
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  let path = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value == null) {
      drawing = false;
      return;
    }
    const x = padding + index * step;
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    path += `${drawing ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
    drawing = true;
  });
  return path.trim();
}

export type MatrixMetric = "count" | "share" | "amount12m";

export const MATRIX_METRICS: { id: MatrixMetric; label: string }[] = [
  { id: "count", label: "تعداد" },
  { id: "share", label: "سهم خرید خالص" },
  { id: "amount12m", label: "خرید ۱۲ ماهه" },
];

export function matrixCellValue(cell: RfmMatrixCell, metric: MatrixMetric): string {
  if (metric === "share") return formatPercent(cell.pct_lifetime_amount);
  if (metric === "amount12m") return formatCompactToman(cell.amount_12m_sum);
  return formatNumber(cell.count);
}

/** Two tooltip lines, e.g. «وفاداران · آخرین خرید ۳۱ تا ۹۰ روز پیش · ۴ تا ۵ خرید». */
export function matrixTooltip(cell: RfmMatrixCell): [string, string] {
  const first = `${cell.segment_label} · آخرین خرید ${cell.r_label} پیش · ${cell.f_label}`;
  const second = [
    `${formatNumber(cell.count)} مشتری (${formatPercent(cell.pct_customers)})`,
    `خرید خالص ${formatCompactToman(cell.lifetime_amount_sum)}`,
    `پرارزش ${formatNumber(cell.high_value_count)}`,
    cell.avg_days_since_last == null ? null : `میانگین ${formatNumber(Math.round(cell.avg_days_since_last))} روز`,
  ]
    .filter(Boolean)
    .join(" · ");
  return [first, second];
}

export const MOVEMENT_WINDOWS = [
  { months: 1, label: "۱ ماه" },
  { months: 3, label: "۳ ماه" },
  { months: 6, label: "۶ ماه" },
  { months: 12, label: "۱۲ ماه" },
] as const;

export type CustomersTab = "rfm" | "calls" | "list";

/** Customers page tab from the URL (`?tab=calls|list`, default RFM report). */
export function customersTab(search: string): CustomersTab {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "list" ? "list" : tab === "calls" ? "calls" : "rfm";
}
