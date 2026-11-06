import { formatNumber } from "../../lib/format";

export const PROFILE_EMPTY = "ثبت نشده";

export function profileValue(value?: string | null): string {
  const text = (value || "").trim();
  return text || PROFILE_EMPTY;
}

export function salesLineTone(line?: string): "accent" | "sage" | "warning" | "neutral" {
  if (line === "ONLINE") return "accent";
  if (line === "SARI") return "sage";
  if (line === "GORGAN") return "warning";
  return "neutral";
}

export function joinFacts(values: string[]): string {
  const clean = values.filter(Boolean);
  return clean.length ? clean.join("، ") : PROFILE_EMPTY;
}

const SCALES: ReadonlyArray<[number, string]> = [
  [1_000_000_000, "میلیارد"],
  [1_000_000, "میلیون"],
  [1_000, "هزار"],
];

/** 87_500_000 → { value: "۸۷٫۵", unit: "میلیون" }: one decimal, Toman as stored. */
export function compactAmount(amount: number | null | undefined): { value: string; unit: string } {
  if (amount == null || Number.isNaN(amount)) return { value: "—", unit: "" };
  const [scale, unit] = SCALES.find(([size]) => Math.abs(amount) >= size) ?? [1, ""];
  const value = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(amount / scale);
  return { value, unit };
}

/** «۴٫۲ میلیون تومان» */
export function amountText(amount: number | null | undefined, currency = true): string {
  const { value, unit } = compactAmount(amount);
  if (value === "—") return value;
  return [value, unit, currency ? "تومان" : ""].filter(Boolean).join(" ");
}

/** «۲۰٪ بیشتر از میانگین طلایی ۱»; null without a comparison. */
export function tierCompareText(percent: number | null | undefined, tierLabel: string): { text: string; sign: number } | null {
  if (percent == null) return null;
  if (percent === 0) return { text: `برابر میانگین ${tierLabel}`, sign: 0 };
  return { text: `${formatNumber(Math.abs(percent))}٪ ${percent > 0 ? "بیشتر" : "کمتر"} از میانگین ${tierLabel}`, sign: Math.sign(percent) };
}

/** «N روز پیش» from a day count. */
export function daysAgo(days: number | null | undefined): string {
  if (days == null) return "—";
  return days === 0 ? "امروز" : `${formatNumber(days)} روز پیش`;
}

/** 09120000027 → «0912 000 0027»; other shapes are returned as stored. */
export function phoneGroups(mobile: string): string {
  return /^\d{11}$/.test(mobile) ? `${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}` : mobile;
}
