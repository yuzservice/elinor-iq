/** Labels, column help and number formats for the Products pages (copy from docs/design/products-prototype.html). */
import { formatJalali, toFaDigits } from "../../lib/dates";
import { isVisibleLine } from "../../lib/salesLines";
import type { LineKey, ProductStatus } from "./types";

/** Every line, for label/colour lookups. Lists, columns and pickers use `visibleLines()` (hidden lines left out). */
export const LINES: { key: LineKey; label: string; color: string }[] = [
  { key: "ONLINE", label: "سایت", color: "var(--ch-online)" },
  { key: "SARI", label: "ساری", color: "var(--ch-sari)" },
  { key: "GORGAN", label: "گرگان", color: "var(--ch-gorgan)" },
  { key: "CAPRI", label: "کاپری", color: "var(--ch-capri)" },
];

export const visibleLines = () => LINES.filter((line) => isVisibleLine(line.key));

export const STATUS: Record<ProductStatus, { label: string; color: string }> = {
  driver: { label: "پیشران فروش", color: "var(--delta-up)" },
  growth: { label: "رو به رشد", color: "var(--accent)" },
  normal: { label: "عادی", color: "var(--text-secondary)" },
  slow: { label: "کند", color: "var(--warning)" },
  stale: { label: "راکد", color: "#fb923c" },
};

export const FILTER_OPTIONS = {
  get lines() {
    return visibleLines().map((line) => ({ value: line.key, label: line.label }));
  },
  status: (Object.keys(STATUS) as ProductStatus[]).map((key) => ({ value: key, label: STATUS[key].label })),
  age: [
    { value: "30", label: "تا ۳۰ روز" },
    { value: "90", label: "۳۱ تا ۹۰ روز" },
    { value: "365", label: "۹۱ تا ۳۶۵ روز" },
    { value: "old", label: "بیش از یک سال" },
  ],
  stock: [
    { value: "charge", label: "نیاز به شارژ فوری" },
    { value: "out", label: "احتمالاً تمام شده" },
    { value: "ok", label: "موجود" },
  ],
  discount: [
    { value: "yes", label: "تخفیف‌دار" },
    { value: "no", label: "بدون تخفیف" },
  ],
};

export const FILTER_LABELS = { lines: "کانال و شعبه", status: "وضعیت فروش", age: "عمر کالا", stock: "موجودی مرکزی", discount: "تخفیف" };

/** [sort key, label, help]; sort key null = not sortable. */
export const COLUMNS: [string | null, string, string][] = [
  ["title", "کالا", "نام و کد کالا. روی آن بزنید تا شناسنامه کالا باز شود."],
  [null, "دسته", "دسته کالا، دقیقاً مثل دسته‌بندی سایت."],
  ["units", "تعداد فروش", "چند عدد در بازه انتخابی فروش رفته است."],
  ["revenue", "مبلغ فروش", "مجموع مبلغ فروش در بازه، به میلیون تومان."],
  ["speed", "فروش هفتگی", "میانگین فروش در هر هفته، بعد از کم کردن مرجوعی‌ها."],
  ["first14", "فروش ۱۴ روز اول", "در دو هفته اول بعد از اولین فروش، چند عدد فروش رفته. نشان می‌دهد کالا چقدر خوب شروع کرده."],
  ["ratio", "نسبت به دسته", "چند برابر یک کالای معمولی همان دسته می‌فروشد. ۲× یعنی دو برابر."],
  ["change", "تغییر", "فروش این بازه نسبت به بازه مقایسه بیشتر شده یا کمتر."],
  ["age", "عمر کالا", "چند روز از اولین فروش این کالا گذشته است."],
  [null, "فروش هر شعبه", "تعداد فروش در سایت و هر فروشگاه. رنگ‌ها در راهنما آمده است."],
  ["discount", "فروش با تخفیف", "چند درصد فروش این کالا با تخفیف بوده است."],
  ["returns", "مرجوعی", "چند درصد فروش برگشت خورده است."],
  [null, "وضعیت", "پیشران فروش، رو به رشد، عادی، کند یا راکد (بدون فروش در ۳۰ روز اخیر)."],
];

const nf0 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });

export const fa = (value: number | null | undefined) => (value == null || Number.isNaN(value) ? "—" : nf0.format(value));
export const fa1 = (value: number | null | undefined) => (value == null || Number.isNaN(value) ? "—" : nf1.format(value));
export const million = (toman: number | null | undefined) => (toman == null ? "—" : fa1(toman / 1_000_000));
export const pct = (share: number | null | undefined) => (share == null ? "—" : `${fa(share * 100)}٪`);
export const jdate = (iso: string | null | undefined) => (iso ? formatJalali(iso) : "—");

/** «▲ ۱۲٪» / «▼ ۴٪»; «—» when there is nothing to compare with. */
export function delta(change: number | null | undefined) {
  if (change == null) return { text: "—", color: "var(--text-faint)" };
  return { text: `${change >= 0 ? "▲" : "▼"} ${toFaDigits(Math.round(Math.abs(change)))}٪`, color: change >= 0 ? "var(--delta-up)" : "var(--delta-down)" };
}

/** Polyline points for a 64×20 sparkline; RTL: oldest on the right. */
export function sparkPoints(values: number[]) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  return values.map((v, i) => `${(62 - (i * 60) / (values.length - 1)).toFixed(1)},${(18 - ((v - min) / range) * 16).toFixed(1)}`).join(" ");
}
