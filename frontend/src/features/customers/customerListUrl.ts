import { formatNumber } from "../../lib/format";

/** All filters, sort and page live in the URL, using the API's own parameter names. */

export type Option = { value: string; label: string };
export type Field =
  | { key: string; label: string; kind: "multi" | "single"; param: string; options: Option[] }
  | { key: string; label: string; kind: "range"; min: string; max: string; unit: string; scale: number }
  | { key: string; label: string; kind: "days"; prefix: "last" | "first" };
export type Category = { key: string; label: string; fields: Field[] };
export type DynamicOptions = { tiers: Option[]; callResults: Option[]; callTags: Option[]; cities: string[]; categories: string[]; sizes: string[] };

export const DAY_OPTIONS: Option[] = [
  { value: "30", label: "تا ۳۰ روز پیش" },
  { value: "90", label: "تا ۹۰ روز پیش" },
  { value: "gt90", label: "بیش از ۹۰ روز" },
  { value: "gt180", label: "بیش از ۱۸۰ روز" },
];
const MILLION = 1_000_000;
const asOptions = (values: string[]) => values.map((value) => ({ value, label: value }));

export function buildCategories(dynamic: DynamicOptions): Category[] {
  return [
    {
      key: "customer",
      label: "مشتری",
      fields: [
        { key: "tier", label: "سطح", kind: "multi", param: "tier", options: dynamic.tiers },
        { key: "city", label: "شهر", kind: "multi", param: "cities", options: asOptions(dynamic.cities) },
        { key: "profile", label: "وضعیت پروفایل", kind: "single", param: "profile_state", options: [{ value: "complete", label: "کامل" }, { value: "incomplete", label: "ناقص" }] },
      ],
    },
    {
      key: "purchase",
      label: "خرید",
      fields: [
        { key: "invoices", label: "تعداد فاکتور", kind: "range", min: "min_invoices", max: "max_invoices", unit: "فاکتور", scale: 1 },
        { key: "total", label: "مجموع خرید", kind: "range", min: "min_total", max: "max_total", unit: "میلیون تومان", scale: MILLION },
        { key: "avg", label: "میانگین سبد خرید", kind: "range", min: "min_avg_basket", max: "max_avg_basket", unit: "میلیون تومان", scale: MILLION },
        { key: "last", label: "آخرین خرید", kind: "days", prefix: "last" },
        { key: "first", label: "اولین خرید", kind: "days", prefix: "first" },
      ],
    },
    {
      key: "channel",
      label: "کانال و پرداخت",
      fields: [
        { key: "channels", label: "کانال", kind: "multi", param: "channels", options: [{ value: "online", label: "آنلاین" }, { value: "physical", label: "حضوری" }, { value: "both", label: "ترکیبی" }] },
        { key: "branch", label: "شعبه", kind: "multi", param: "branches", options: [{ value: "ONLINE", label: "سایت" }, { value: "SARI", label: "ساری" }, { value: "GORGAN", label: "گرگان" }, { value: "CAPRI", label: "کاپری" }] },
        { key: "pay", label: "روش پرداخت", kind: "multi", param: "payments", options: [{ value: "snappay", label: "اسنپ‌پی" }, { value: "digipay", label: "دیجی‌پی" }, { value: "shopino", label: "شاپینو" }] },
        { key: "discount", label: "تخفیف", kind: "single", param: "discount", options: [{ value: "yes", label: "دارد" }, { value: "no", label: "ندارد" }] },
      ],
    },
    {
      key: "product",
      label: "کالا",
      fields: [
        { key: "cat", label: "دسته‌بندی", kind: "multi", param: "categories", options: asOptions(dynamic.categories) },
        { key: "size", label: "سایز", kind: "multi", param: "sizes", options: asOptions(dynamic.sizes) },
      ],
    },
    {
      key: "call",
      label: "تماس",
      fields: [
        { key: "result", label: "آخرین نتیجه", kind: "multi", param: "call_result", options: [...dynamic.callResults, { value: "none", label: "بدون تماس" }] },
        { key: "tag", label: "برچسب", kind: "multi", param: "call_tag", options: dynamic.callTags },
        { key: "dnc", label: "تماس نگیرید", kind: "single", param: "do_not_call", options: [{ value: "yes", label: "بله" }, { value: "no", label: "خیر" }] },
      ],
    },
  ];
}

export const PRESETS: { label: string; filters: Record<string, string> }[] = [
  { label: "غیرفعال ۹۰ روز", filters: { last_days: "gt90" } },
  { label: "تک‌خریدی", filters: { min_invoices: "1", max_invoices: "1" } },
  { label: "خریداران ارزشمند", filters: { min_avg_basket: String(5 * MILLION) } },
  { label: "چندکاناله", filters: { channels: "both" } },
];

/** URL params that are not list filters. */
const NON_FILTER = new Set(["tab", "tierRules", "edit_list", "page", "sort", "dir"]);

export function filterParams(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    if (!NON_FILTER.has(key) && value !== "") out[key] = value;
  });
  return out;
}

export function hasFilters(params: URLSearchParams): boolean {
  return Object.keys(filterParams(params)).length > 0;
}

export const splitList = (raw: string | null) => (raw ? raw.split(",").filter(Boolean) : []);

/** Copy of params with the changes applied; a filter change returns to page 1. Empty values are removed. */
export function withChanges(params: URLSearchParams, changes: Record<string, string | null>): URLSearchParams {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value) next.set(key, value);
    else next.delete(key);
  });
  next.delete("page");
  return next;
}

export function replaceFilters(params: URLSearchParams, filters: Record<string, unknown>): URLSearchParams {
  const next = new URLSearchParams();
  params.forEach((value, key) => {
    if (NON_FILTER.has(key) && key !== "page") next.set(key, value);
  });
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== "" && key !== "page" && key !== "per_page") next.set(key, String(value));
  });
  return next;
}

export function toggleInList(raw: string | null, value: string): string {
  const current = splitList(raw);
  return (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]).join(",");
}

function fieldParams(field: Field): string[] {
  if (field.kind === "range") return [field.min, field.max];
  if (field.kind === "days") return [`${field.prefix}_days`, `${field.prefix}_after`, `${field.prefix}_before`];
  return [field.param];
}

export function isFieldActive(field: Field, params: URLSearchParams): boolean {
  return fieldParams(field).some((param) => params.get(param));
}

export function categoryCount(category: Category, params: URLSearchParams): number {
  return category.fields.filter((field) => isFieldActive(field, params)).length;
}

const fa1 = (value: number) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value);

function chipText(field: Field, params: URLSearchParams): string {
  if (field.kind === "range") {
    const part = (param: string, prefix: string) => (params.get(param) ? `${prefix} ${fa1(Number(params.get(param)) / field.scale)}` : "");
    return [part(field.min, "از"), part(field.max, "تا")].filter(Boolean).join(" ");
  }
  if (field.kind === "days") {
    const days = DAY_OPTIONS.find((option) => option.value === params.get(`${field.prefix}_days`));
    if (days) return days.label;
    const after = params.get(`${field.prefix}_after`);
    const before = params.get(`${field.prefix}_before`);
    return [after ? `از ${after}` : "", before ? `تا ${before}` : ""].filter(Boolean).join(" ");
  }
  return splitList(params.get(field.param))
    .map((value) => field.options.find((option) => option.value === value)?.label ?? value)
    .join("، ");
}

/** Old saved lists can hold parameters with no field in the panel; they stay visible and removable. */
const LEGACY_LABELS: Record<string, string> = {
  search: "",
  population: "جمعیت",
  channel: "کانال",
  min_purchases: "حداقل خرید",
  max_purchases: "حداکثر خرید",
  min_amount: "حداقل مبلغ",
  max_amount: "حداکثر مبلغ",
  last_from: "آخرین خرید از",
  last_to: "آخرین خرید تا",
  first_from: "اولین خرید از",
  first_to: "اولین خرید تا",
  order_behavior: "رفتار سفارش",
  birth_month: "ماه تولد",
  tier_channel: "کانال سطح",
  sales_lines: "شعبه",
  sales_lines_mode: "حالت شعبه",
  payment_method: "روش پرداخت",
  has_discount: "تخفیف",
  size: "سایز",
  category: "دسته‌بندی",
  city: "شهر",
};

export type Chip = { key: string; label: string; aria: string; remove: Record<string, null> };

export function activeChips(categories: Category[], params: URLSearchParams): Chip[] {
  const chips: Chip[] = [];
  const known = new Set<string>(["search"]);
  categories.forEach((category) =>
    category.fields.forEach((field) => {
      const owned = fieldParams(field);
      owned.forEach((param) => known.add(param));
      if (!isFieldActive(field, params)) return;
      chips.push({
        key: field.key,
        label: `${field.label}: ${chipText(field, params)}`,
        aria: `حذف فیلتر ${field.label}`,
        remove: Object.fromEntries(owned.map((param) => [param, null])),
      });
    }),
  );
  Object.entries(filterParams(params)).forEach(([key, value]) => {
    if (known.has(key)) return;
    const label = LEGACY_LABELS[key] ?? key;
    chips.push({ key, label: `${label}: ${value}`, aria: `حذف فیلتر ${label}`, remove: { [key]: null } });
  });
  return chips;
}

// --- Sort ---------------------------------------------------------------------------------------

export type SortKey = "name" | "tier" | "avg_basket" | "invoice_count" | "total_amount" | "last_purchase" | "first_purchase";
const FIRST_CLICK: Record<SortKey, "asc" | "desc"> = {
  name: "asc",
  tier: "asc",
  avg_basket: "desc",
  invoice_count: "desc",
  total_amount: "desc",
  last_purchase: "desc", // most recent first
  first_purchase: "asc", // oldest first
};
const DAYS_COLUMNS: SortKey[] = ["last_purchase", "first_purchase"];

export function currentSort(params: URLSearchParams): { sort: SortKey; dir: "asc" | "desc" } {
  const sort = params.get("sort") as SortKey;
  const known = sort && sort in FIRST_CLICK;
  const dir = params.get("dir");
  return { sort: known ? sort : "last_purchase", dir: dir === "asc" || dir === "desc" ? dir : known ? FIRST_CLICK[sort] : "desc" };
}

export function nextSort(params: URLSearchParams, column: SortKey): URLSearchParams {
  const { sort, dir } = currentSort(params);
  const next = new URLSearchParams(params);
  next.set("sort", column);
  next.set("dir", sort === column ? (dir === "asc" ? "desc" : "asc") : FIRST_CLICK[column]);
  next.delete("page");
  return next;
}

/** Date columns show «N روز پیش», so the most recent date is the ascending direction on screen. */
export function ariaSort(params: URLSearchParams, column: SortKey): "ascending" | "descending" | "none" {
  const { sort, dir } = currentSort(params);
  if (sort !== column) return "none";
  const ascending = DAYS_COLUMNS.includes(column) ? dir === "desc" : dir === "asc";
  return ascending ? "ascending" : "descending";
}

export function listQuery(params: URLSearchParams, perPage: number, selected: number[] = []): string {
  const { sort, dir } = currentSort(params);
  const query = new URLSearchParams(filterParams(params));
  query.set("sort", sort);
  query.set("dir", dir);
  query.set("page", String(currentPage(params)));
  query.set("per_page", String(perPage));
  if (selected.length) query.set("ids", selected.join(","));
  return query.toString();
}

export function currentPage(params: URLSearchParams): number {
  const page = Number(params.get("page"));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

// --- Cells ---------------------------------------------------------------------------------------

export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

export function daysAgoText(days: number | null): string {
  return days == null ? "—" : `${formatNumber(days)} روز پیش`;
}

export function recencyColor(days: number | null): string | null {
  if (days == null) return null;
  return days <= 90 ? "#34d399" : days <= 180 ? "#fbbf24" : "#fb7185";
}

export function millionText(toman: number | null | undefined): string {
  return toman == null ? "—" : `${fa1(Math.round((toman / MILLION) * 10) / 10)} میلیون`;
}

export function basketBar(value: number | null | undefined, pageMax: number): number {
  if (!value || value <= 0 || pageMax <= 0) return 0;
  return Math.round((value / pageMax) * 100);
}

const BRANCHES: Record<string, string> = { ONLINE: "سایت", SARI: "ساری", GORGAN: "گرگان", CAPRI: "کاپری" };
const CHANNELS: Record<string, { label: string; color: string }> = {
  online: { label: "آنلاین", color: "var(--ch-online)" },
  physical: { label: "حضوری", color: "var(--ch-sari)" },
  both: { label: "ترکیبی", color: "var(--ch-capri)" },
};

export function channelCell(channel: string, lines: string[]): { text: string; color: string | null } {
  const meta = CHANNELS[channel];
  if (!meta) return { text: "—", color: null };
  const branches = lines.map((line) => BRANCHES[line] ?? line).join("، ");
  return { text: branches ? `${meta.label}، ${branches}` : meta.label, color: meta.color };
}

export function compareNote(value: number | null | undefined, base: number | null | undefined): { text: string; sign: number } {
  if (!value || !base) return { text: "—", sign: 0 };
  const percent = Math.round((value / base - 1) * 100);
  if (percent === 0) return { text: "برابر میانگین کل", sign: 0 };
  return { text: `${formatNumber(Math.abs(percent))}٪ ${percent > 0 ? "بیشتر" : "کمتر"} از میانگین کل`, sign: Math.sign(percent) };
}

// --- Tier colors ----------------------------------------------------------------------------------

const TIER_COLORS: Record<string, [string, string]> = {
  VIP: ["#a78bfa", "#7c3aed"],
  DIAMOND: ["#60a5fa", "#2563eb"],
  GOLD_1: ["#fbbf24", "#b45309"],
  GOLD_2: ["#fbbf24", "#b45309"],
  SILVER: ["#cbd5e1", "#475569"],
  BRONZE_1: ["#fb923c", "#c2410c"],
  BRONZE_2: ["#fb923c", "#c2410c"],
  BRONZE_3: ["#fb923c", "#c2410c"],
};
const CUSTOM_COLORS: [string, string][] = [["#34d399", "#047857"], ["#f472b6", "#be185d"], ["#22d3ee", "#0e7490"], ["#a3e635", "#4d7c0f"]];

/** [dark, light]. The same code always gets the same color, channel-prefixed codes share their base tier's. */
export function tierColors(code: string): [string, string] {
  const base = code.startsWith("ONLINE_") ? code.slice("ONLINE_".length) : code;
  if (TIER_COLORS[base]) return TIER_COLORS[base];
  const hash = [...base].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CUSTOM_COLORS[hash % CUSTOM_COLORS.length];
}

// --- Optional columns ------------------------------------------------------------------------------

export type OptionalColumns = { total: boolean; first: boolean; city: boolean };
export const NO_OPTIONAL_COLUMNS: OptionalColumns = { total: false, first: false, city: false };

export const columnsKey = (userId: number | undefined) => `customer-list-columns:${userId ?? "anon"}`;

export function readColumns(key: string): OptionalColumns {
  try {
    return { ...NO_OPTIONAL_COLUMNS, ...JSON.parse(window.localStorage.getItem(key) ?? "{}") };
  } catch {
    return NO_OPTIONAL_COLUMNS;
  }
}

export function writeColumns(key: string, columns: OptionalColumns) {
  try {
    window.localStorage.setItem(key, JSON.stringify(columns));
  } catch {
    // storage blocked: the choice just isn't remembered
  }
}
