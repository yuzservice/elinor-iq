import { formatJalali } from "../../lib/dates";
import { indexTree, parseIds, type CategoryNode } from "../categories/categoryTree";
import { formatNumber } from "../../lib/format";

/** All filters, sort and page live in the URL, using the API's own parameter names. */

export type Option = { value: string; label: string; count?: number; group?: string };
export type Field =
  | { key: string; label: string; kind: "multi" | "single"; param: string; options: Option[]; dependsOn?: string; note?: string }
  | { key: string; label: string; kind: "products"; param: string; options: Option[] }
  | { key: string; label: string; kind: "tree"; param: string; nodes: CategoryNode[] }
  | { key: string; label: string; kind: "daterange"; after: string; before: string; direction?: { param: string; options: Option[] } }
  | { key: string; label: string; kind: "range"; min: string; max: string; unit: string; scale: number }
  | { key: string; label: string; kind: "dates" };

export type DatePrefix = "last" | "first";
export const DATE_TYPES: { value: DatePrefix; label: string }[] = [
  { value: "last", label: "آخرین خرید" },
  { value: "first", label: "اولین خرید" },
];
export type Category = { key: string; label: string; fields: Field[] };
export type DynamicOptions = {
  tiers: Option[];
  callResults: Option[];
  callTags: Option[];
  categoryTree: CategoryNode[];
  sizes: string[];
  provinces?: Option[];
  citiesById?: Option[]; // group = province id
  products?: Option[]; // titles of products known so far (selected or found)
  fillRates?: Record<string, number>;
};

/** A filter whose data is filled for fewer customers than this (percent) is hidden from the panel. */
export const MIN_FILL_RATE = 5;
export const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const ADDRESS_NOTE = "فقط مشتریانی که آدرس ثبت‌شده دارند";

export const DAY_OPTIONS: Option[] = [
  { value: "30", label: "تا ۳۰ روز پیش" },
  { value: "90", label: "تا ۹۰ روز پیش" },
  { value: "gt90", label: "بیش از ۹۰ روز" },
  { value: "gt180", label: "بیش از ۱۸۰ روز" },
];
const MILLION = 1_000_000;
const asOptions = (values: string[]) => values.map((value) => ({ value, label: value }));

/** Hidden until fill rates are known, and when they are under MIN_FILL_RATE. */
function visible(dynamic: DynamicOptions, key: string, field: Field): Field[] {
  const rate = dynamic.fillRates?.[key];
  return rate != null && rate >= MIN_FILL_RATE ? [field] : [];
}

/** Cities of the selected provinces only; all cities when no province is selected. */
export function dependentOptions(field: Field, params: URLSearchParams): Option[] {
  if (field.kind !== "multi" || !field.dependsOn) return field.kind === "multi" || field.kind === "single" ? field.options : [];
  const provinces = splitList(params.get(field.dependsOn));
  return provinces.length ? field.options.filter((option) => option.group && provinces.includes(option.group)) : field.options;
}

export function buildCategories(dynamic: DynamicOptions): Category[] {
  return [
    {
      key: "customer",
      label: "مشتری",
      fields: [
        { key: "tier", label: "سطح", kind: "multi", param: "tier", options: dynamic.tiers },
        { key: "province", label: "استان", kind: "multi", param: "provinces", options: dynamic.provinces ?? [], note: ADDRESS_NOTE },
        { key: "city", label: "شهر", kind: "multi", param: "city_ids", options: dynamic.citiesById ?? [], dependsOn: "provinces", note: ADDRESS_NOTE },
        { key: "profile", label: "وضعیت پروفایل", kind: "single", param: "profile_state", options: [{ value: "complete", label: "کامل" }, { value: "incomplete", label: "ناقص" }] },
        ...visible(dynamic, "birth_month", { key: "birth", label: "ماه تولد", kind: "multi", param: "birth_months", options: JALALI_MONTHS.map((label, index) => ({ value: String(index + 1), label })) } as Field),
        ...visible(dynamic, "gender", { key: "gender", label: "جنسیت", kind: "multi", param: "genders", options: [{ value: "female", label: "زن" }, { value: "male", label: "مرد" }] } as Field),
        ...visible(dynamic, "joined", { key: "joined", label: "تاریخ عضویت", kind: "daterange", after: "joined_after", before: "joined_before" } as Field),
        ...visible(dynamic, "tier_change", {
          key: "tierChange",
          label: "تغییر سطح اخیر",
          kind: "daterange",
          after: "tier_change_after",
          before: "tier_change_before",
          direction: { param: "tier_change", options: [{ value: "up", label: "ارتقا" }, { value: "down", label: "تنزل" }] },
        } as Field),
      ],
    },
    {
      key: "purchase",
      label: "خرید",
      fields: [
        { key: "invoices", label: "تعداد فاکتور", kind: "range", min: "min_invoices", max: "max_invoices", unit: "فاکتور", scale: 1 },
        { key: "total", label: "مجموع خرید", kind: "range", min: "min_total", max: "max_total", unit: "میلیون تومان", scale: MILLION },
        { key: "avg", label: "میانگین سبد خرید", kind: "range", min: "min_avg_basket", max: "max_avg_basket", unit: "میلیون تومان", scale: MILLION },
        { key: "dates", label: "تاریخ خرید", kind: "dates" },
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
        { key: "products", label: "خرید کالای مشخص", kind: "products", param: "products", options: dynamic.products ?? [] },
        { key: "cat", label: "دسته‌بندی", kind: "tree", param: "category_ids", nodes: dynamic.categoryTree },
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

function fieldParams(field: Field): string[] {
  if (field.kind === "range") return [field.min, field.max];
  if (field.kind === "dates") return DATE_TYPES.flatMap((type) => datePrefixParams(type.value));
  if (field.kind === "daterange") return [field.direction?.param, field.after, field.before].filter((param): param is string => Boolean(param));
  return [field.param];
}

/** «پاک کردن این دسته»: every param the category's fields own. */
export function clearCategory(category: Category): Record<string, null> {
  return Object.fromEntries(category.fields.flatMap(fieldParams).map((param) => [param, null]));
}

export function isFieldActive(field: Field, params: URLSearchParams): boolean {
  return fieldParams(field).some((param) => params.get(param));
}

export function categoryCount(category: Category, params: URLSearchParams): number {
  return category.fields.filter((field) => isFieldActive(field, params)).length;
}

const fa1 = (value: number) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value);

function chipText(field: Field, params: URLSearchParams): string {
  if (field.kind === "dates") return "";
  if (field.kind === "daterange") {
    const direction = field.direction?.options.find((option) => option.value === params.get(field.direction?.param ?? ""))?.label;
    const after = params.get(field.after);
    const before = params.get(field.before);
    return [direction ?? "", after ? `از ${formatJalali(after)}` : "", before ? `تا ${formatJalali(before)}` : ""].filter(Boolean).join(" ");
  }
  if (field.kind === "range") {
    const part = (param: string, prefix: string) => (params.get(param) ? `${prefix} ${fa1(Number(params.get(param)) / field.scale)}` : "");
    return [part(field.min, "از"), part(field.max, "تا")].filter(Boolean).join(" ");
  }
  if (field.kind === "tree") {
    const index = indexTree(field.nodes);
    return parseIds(params.get(field.param)).map((id) => index.byId.get(id)?.label ?? String(id)).join("، ");
  }
  return splitList(params.get(field.param))
    .map((value) => field.options.find((option) => option.value === value)?.label ?? value)
    .join("، ");
}

/** Closed dropdown text: «همه», the one label, or «N مورد». */
export function selectionLabel(selected: string[], options: Option[]): string {
  if (!selected.length) return "همه";
  if (selected.length === 1) return options.find((option) => option.value === selected[0])?.label ?? selected[0];
  return `${formatNumber(selected.length)} مورد`;
}

export function filterOptions(options: Option[], query: string): Option[] {
  const term = query.trim();
  return term ? options.filter((option) => option.label.includes(term) || option.value.toLowerCase().includes(term.toLowerCase())) : options;
}

/** Old saved lists can hold parameters with no field in the panel; they stay visible and removable. */
const LEGACY_LABELS: Record<string, string> = {
  categories: "دسته‌بندی (فیلتر قدیمی)",
  tier_change_from: "تنزل از سطوح",
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
  cities: "شهر",
};

export type Chip = { key: string; label: string; aria: string; remove: Record<string, null> };

export function datePrefixParams(prefix: DatePrefix): string[] {
  return [`${prefix}_after`, `${prefix}_before`, `${prefix}_days`];
}

/** Date rows on screen: each type with any param in the URL, plus rows the user just added (still empty). */
export function dateRows(params: URLSearchParams, added: DatePrefix[] = []): DatePrefix[] {
  return DATE_TYPES.map((type) => type.value).filter(
    (prefix) => added.includes(prefix) || datePrefixParams(prefix).some((param) => params.get(param)),
  );
}

/** Moving a row to the other type carries its dates; the old type's params are removed. */
export function switchDateType(params: URLSearchParams, from: DatePrefix, to: DatePrefix): Record<string, string | null> {
  return {
    [`${to}_after`]: params.get(`${from}_after`),
    [`${to}_before`]: params.get(`${from}_before`),
    [`${to}_days`]: params.get(`${from}_days`),
    [`${from}_after`]: null,
    [`${from}_before`]: null,
    [`${from}_days`]: null,
  };
}

/** «آخرین خرید: از ۱۴۰۵/۰۱/۰۱ تا ۱۴۰۵/۰۶/۳۱»; old relative windows keep their label. */
export function dateChipText(params: URLSearchParams, prefix: DatePrefix): string {
  const days = DAY_OPTIONS.find((option) => option.value === params.get(`${prefix}_days`));
  const after = params.get(`${prefix}_after`);
  const before = params.get(`${prefix}_before`);
  const parts = [days?.label ?? "", after ? `از ${formatJalali(after)}` : "", before ? `تا ${formatJalali(before)}` : ""].filter(Boolean);
  return `${DATE_TYPES.find((type) => type.value === prefix)?.label}: ${parts.join(" ")}`;
}

export function activeChips(categories: Category[], params: URLSearchParams): Chip[] {
  const chips: Chip[] = [];
  const known = new Set<string>(["search"]);
  categories.forEach((category) =>
    category.fields.forEach((field) => {
      const owned = fieldParams(field);
      owned.forEach((param) => known.add(param));
      if (!isFieldActive(field, params)) return;
      if (field.kind === "dates") {
        DATE_TYPES.forEach(({ value: prefix, label }) => {
          if (!datePrefixParams(prefix).some((param) => params.get(param))) return;
          chips.push({
            key: `dates-${prefix}`,
            label: dateChipText(params, prefix),
            aria: `حذف فیلتر ${label}`,
            remove: Object.fromEntries(datePrefixParams(prefix).map((param) => [param, null])),
          });
        });
        return;
      }
      chips.push({
        key: field.key,
        label: `${field.label}: ${chipText(field, params)}`,
        aria: `حذف فیلتر ${field.label}`,
        remove: Object.fromEntries(owned.map((param) => [param, null])),
      });
    }),
  );
  // Tier titles for «تنزل از سطوح» (set by the Home attention link); codes stay in the URL.
  const tierOptions = categories.flatMap((c) => c.fields).find((f) => f.key === "tier");
  const tierTitle = (code: string) =>
    (tierOptions && "options" in tierOptions ? tierOptions.options.find((o) => o.value === code)?.label : undefined) ?? code;
  Object.entries(filterParams(params)).forEach(([key, value]) => {
    if (known.has(key)) return;
    const label = LEGACY_LABELS[key] ?? key;
    const shown = key === "tier_change_from" ? String(value).split(",").map(tierTitle).join("، ") : value;
    chips.push({ key, label: `${label}: ${shown}`, aria: `حذف فیلتر ${label}`, remove: { [key]: null } });
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

/** Search box inside a dropdown once its list is longer than this. */
export const SEARCH_THRESHOLD = 8;

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
