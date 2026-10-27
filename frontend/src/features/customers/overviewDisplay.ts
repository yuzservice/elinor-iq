import { formatNumber } from "../../lib/format";
import type { CustomerOverviewData, OverviewLens, OverviewMetric } from "../../types";

export const PERIODS = [
  { value: "30", label: "۳۰ روز" },
  { value: "month", label: "ماه جاری" },
  { value: "90", label: "۹۰ روز" },
  { value: "365", label: "۱۲ ماه" },
] as const;

export type LensMeta = { key: OverviewLens; name: string; color: string; group: "all" | "ch" | "pay" };

export const LENSES: LensMeta[] = [
  { key: "total", name: "همه الینور", color: "var(--text)", group: "all" },
  { key: "site", name: "سایت", color: "var(--ch-online)", group: "ch" },
  { key: "sari", name: "ساری", color: "var(--ch-sari)", group: "ch" },
  { key: "gorgan", name: "گرگان", color: "var(--ch-gorgan)", group: "ch" },
  { key: "capri", name: "کاپری", color: "var(--ch-capri)", group: "ch" },
  { key: "shopino", name: "شاپینو", color: "var(--ch-shopino)", group: "pay" },
  { key: "snappay", name: "اسنپ‌پی", color: "var(--ch-snappay)", group: "pay" },
  { key: "digipay", name: "دیجی‌پی", color: "var(--ch-digipay)", group: "pay" },
];

export const lensName = (key: OverviewLens) => LENSES.find((lens) => lens.key === key)?.name ?? key;

export type MetricMeta = { key: OverviewMetric; title: string; unit: string; color: string; def: string };

export const METRICS: MetricMeta[] = [
  { key: "customers", title: "کل مشتریان", unit: "خریدار", color: "#3b82f6", def: "مشتریانی که از ابتدا تا امروز دست‌کم یک خرید معتبر داشته‌اند." },
  { key: "active", title: "خریداران فعال", unit: "نفر", color: "#10b981", def: "مشتریانی که در بازه انتخابی دست‌کم یک خرید معتبر داشته‌اند." },
  { key: "basket", title: "میانگین سبد خرید", unit: "هزار تومان", color: "#a78bfa", def: "فروش خالص بازه تقسیم بر تعداد فاکتورهای معتبر همان بازه." },
  { key: "repeat", title: "نرخ خرید مجدد", unit: "از فعال‌ها", color: "#f59e0b", def: "سهم خریداران فعال بازه که پیش از آن هم خرید کرده بودند." },
];

export const NO_COMPARE = "داده مقایسه کافی نیست";

const fa = (value: number) => formatNumber(Math.round(value));

export function metricValue(metric: OverviewMetric, value: number | null): string {
  if (value == null) return "—";
  if (metric === "basket") return fa(value / 1000);
  if (metric === "repeat") return `${fa(value)}٪`;
  return fa(value);
}

/** Delta text, direction and title; repeat is in percentage points («واحد»), customers shows new buyers. */
export function metricDelta(metric: OverviewMetric, data: CustomerOverviewData["lenses"][OverviewLens]) {
  if (metric === "customers") {
    const added = data.customers.new;
    return added == null ? { text: "—", up: null, title: NO_COMPARE } : { text: `+${fa(added)} جدید`, up: true, title: "" };
  }
  const delta = data[metric].delta;
  if (delta == null) return { text: "—", up: null, title: NO_COMPARE };
  return { text: deltaText(delta, metric === "repeat"), up: delta >= 0, title: "" };
}

export function deltaText(delta: number, points = false): string {
  return `${delta >= 0 ? "▲ " : "▼ "}${formatNumber(Math.abs(delta))}${points ? " واحد" : "٪"}`;
}

/** Sparkline polylines in a 96x34 box, oldest left; a null point breaks the line. */
export function sparkSegments(values: Array<number | null>): string[] {
  const present = values.filter((value): value is number => value != null);
  if (!present.length) return [];
  const min = Math.min(...present);
  const range = Math.max(...present) - min || 1;
  const step = 92 / Math.max(1, values.length - 1);
  const segments: string[][] = [[]];
  values.forEach((value, index) => {
    if (value == null) {
      if (segments[segments.length - 1].length) segments.push([]);
      return;
    }
    segments[segments.length - 1].push(`${(2 + index * step).toFixed(1)},${(31 - ((value - min) / range) * 28).toFixed(1)}`);
  });
  return segments.filter((points) => points.length).map((points) => (points.length === 1 ? `${points[0]} ${points[0]}` : points.join(" ")));
}

export function barWidth(value: number | null, max: number): number {
  if (value == null || max <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

export function insightTexts(data: CustomerOverviewData) {
  const { best_active: best, worst_active: worst, top_tier: tier } = data.insights;
  const rows: Array<{ text: string; tone: "up" | "down" | "neutral" }> = [];
  if (best) rows.push({ text: `بیشترین رشد خریدار فعال: ${lensName(best.lens)} ${deltaText(best.delta)}`, tone: "up" });
  if (worst) rows.push({ text: `بیشترین افت خریدار فعال: ${lensName(worst.lens)} ${deltaText(worst.delta)}`, tone: "down" });
  if (tier) rows.push({ text: `بیشترین ورود به سطح: ${tier.title} +${fa(tier.net)}`, tone: "neutral" });
  return rows;
}

export function tierNetText(net: number): string {
  return `${net >= 0 ? "+" : "−"}${fa(Math.abs(net))}`;
}

export const collapsedKey = (userId: number | string | undefined) => `customers-overview-collapsed:${userId ?? "anon"}`;

export function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsed(key: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(key, collapsed ? "1" : "0");
  } catch {
    // storage blocked: the state just isn't remembered
  }
}
