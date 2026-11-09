import type { Band, PostCard } from "./types";

const FA = "۰۱۲۳۴۵۶۷۸۹";

export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => FA[Number(digit)]);
}

/** Persian number with grouping; up to `decimals` fraction digits. */
export function fa(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: decimals }).format(value);
}

/** 221000 → «۲۲۱ هزار», 1240000 → «۱٫۲ میلیون». */
export function compact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${fa(value / 1_000_000, 1)} میلیون`;
  if (abs >= 1_000) return `${fa(value / 1_000, abs >= 100_000 ? 0 : 1)} هزار`;
  return fa(Math.round(value));
}

/** Product codes are plain digits: «۸۵۰۴», never «۸٬۵۰۴». */
export function code(value: string): string {
  return faDigits(value);
}

export function percent(value: number | null | undefined, decimals = 0): string {
  return value == null ? "—" : `${fa(value, decimals)}٪`;
}

export function scoreText(score: number | null | undefined): string {
  return score == null ? "—" : `${fa(score, 1)}×`;
}

/** Same bands as the backend (apps/pulse/rules.py). */
export function scoreBand(score: number | null | undefined): Band {
  if (score == null) return null;
  if (score >= 1.5) return "great";
  if (score >= 1) return "good";
  if (score >= 0.7) return "mid";
  return "bad";
}

export function bandColor(band: Band): string {
  return band ? `var(--s-${band})` : "var(--text-faint)";
}

export function clock(post: Pick<PostCard, "hour" | "minute">): string {
  return faDigits(`${String(post.hour).padStart(2, "0")}:${String(post.minute).padStart(2, "0")}`);
}

export const KIND_LABEL = { reel: "ریل", carousel: "اسلاید", image: "عکس" } as const;
export const GROUP_LABEL = { reel: "ریل", slide: "اسلاید" } as const;

export function postTitle(caption: string, limit = 60): string {
  const line = caption.split("\n").map((item) => item.replace(/‏/g, "").trim()).find(Boolean) ?? "بدون کپشن";
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}

export function jalali(value: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", ...options }).format(new Date(value));
}

/** Warm gradient placeholder when a post has no cover or product image yet. */
export function coverGradient(post: Pick<PostCard, "id" | "kind" | "brand">): string {
  const hue = [28, 18, 35, 12, 40, 22][post.id % 6];
  if (post.kind === "carousel") return `linear-gradient(140deg,hsl(${hue} 45% 52%),hsl(${hue + 10} 35% 22%))`;
  if (post.brand) return "linear-gradient(140deg,hsl(330 35% 45%),hsl(280 25% 20%))";
  return `linear-gradient(140deg,hsl(${hue} 25% 70%),hsl(${hue} 20% 32%))`;
}
