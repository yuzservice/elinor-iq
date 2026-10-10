import type { CustomerListParams } from "../../services/customers";

export const TIER_OPTIONS = [
  { value: "VIP", label: "VIP پلاتینیوم", icon: "👑", desc: "بیش از ۱۰ میلیون، ۴+ خرید، زیر ۴۵ روز" },
  { value: "DIAMOND", label: "الماس الینور", icon: "💎", desc: "بیش از ۵ میلیون، ۳+ خرید، زیر ۹۰ روز" },
  { value: "GOLD_1", label: "طلایی سطح ۱ (VIP در خطر)", icon: "⭐️", desc: "۱۰م+، ۴+ خرید، ۹۰-۳۶۵ روز" },
  { value: "GOLD_2", label: "طلایی سطح ۲", icon: "⭐️", desc: "۲+ خرید، زیر ۹۰ روز" },
  { value: "SILVER", label: "نقره‌ای", icon: "🥈", desc: "۱+ خرید، ۳۰ تا ۹۰ روز" },
  { value: "BRONZE_1", label: "برنزی سطح ۱ (خریدار تازه)", icon: "🥉", desc: "۱+ خرید، زیر ۳۰ روز" },
  { value: "BRONZE_2", label: "برنزی سطح ۲ (کم‌تحرک)", icon: "🥉", desc: "۹۰ تا ۱۸۰ روز بدون خرید" },
  { value: "BRONZE_3", label: "برنزی سطح ۳ (ریزش‌کرده/سرد)", icon: "🥉", desc: "بیش از ۱۸۰ روز بدون خرید" },
] as const;

export const SALES_LINE_OPTIONS = [
  { value: "online", label: "وب‌سایت آنلاین", branchCode: "ONLINE" },
  { value: "sari", label: "شعبه ساری", branchCode: "SARI" },
  { value: "gorgan", label: "شعبه گرگان", branchCode: "GORGAN" },
  { value: "capri", label: "شعبه کاپری", branchCode: "CAPRI" },
] as const;

export type SalesLineValue = (typeof SALES_LINE_OPTIONS)[number]["value"];

export const CHANNEL_OPTIONS = [
  { value: "", label: "همه کانال‌ها", icon: "🌐" },
  { value: "online", label: "فقط آنلاین (سایت)", icon: "💻" },
  { value: "physical", label: "فقط شعب حضوری", icon: "🏬" },
  { value: "both", label: "خرید ترکیبی (Omnichannel)", icon: "🔄" },
] as const;

export const SORT_OPTIONS = [
  { value: "last_purchase", label: "تازه‌ترین خرید (پیش‌فرض)", icon: "⏱️" },
  { value: "purchase_count", label: "بیشترین تعداد خرید", icon: "📈" },
  { value: "name", label: "نام مشتری (حروف الفبا)", icon: "🔤" },
] as const;

export const PURCHASE_VOLUME_PRESETS = [
  { label: "همه", min: "", max: "" },
  { label: "خرید اولی (۱ بار)", min: "1", max: "1" },
  { label: "تکرارکننده (۲ تا ۵ بار)", min: "2", max: "5" },
  { label: "مشتری وفادار (۶+ بار)", min: "6", max: "" },
] as const;

export type CustomerListFilters = {
  population: string;
  tier: string;
  channel: string;
  salesLines: SalesLineValue[];
  minPurchases: string;
  maxPurchases: string;
  lastFrom: string;
  lastTo: string;
  sort: string;
};

export const EMPTY_CUSTOMER_FILTERS: CustomerListFilters = {
  population: "all",
  tier: "",
  channel: "",
  salesLines: [],
  minPurchases: "",
  maxPurchases: "",
  lastFrom: "",
  lastTo: "",
  sort: "last_purchase",
};

export function salesLinesToParam(salesLines: SalesLineValue[]): string {
  return salesLines.join(",");
}

export function buildCustomerListParams(
  filters: CustomerListFilters,
  search: string,
  options: { page?: number; perPage?: number } = {},
): CustomerListParams {
  return {
    search: search ? search.trim() : undefined,
    population: filters.population !== "all" ? filters.population : undefined,
    tier: filters.tier || undefined,
    channel: filters.channel || undefined,
    sales_lines: filters.salesLines.length > 0 ? salesLinesToParam(filters.salesLines) : undefined,
    min_purchases: filters.minPurchases || undefined,
    max_purchases: filters.maxPurchases || undefined,
    last_from: filters.lastFrom || undefined,
    last_to: filters.lastTo || undefined,
    sort: filters.sort || undefined,
    page: options.page,
    per_page: options.perPage,
  };
}

export function describeCustomerFilters(filters: CustomerListFilters, search = ""): string[] {
  const chips: string[] = [];

  if (search) {
    chips.push(`جستجو: ${search}`);
  }

  if (filters.population === "purchasing") {
    chips.push("فقط مشتریان خریدار");
  } else if (filters.population === "registered") {
    chips.push("ثبت‌شده بدون خرید");
  }

  if (filters.minPurchases) {
    chips.push(`حداقل ${filters.minPurchases} خرید`);
  }
  if (filters.maxPurchases) {
    chips.push(`حداکثر ${filters.maxPurchases} خرید`);
  }
  if (filters.lastFrom || filters.lastTo) {
    const from = filters.lastFrom || "…";
    const to = filters.lastTo || "…";
    chips.push(`آخرین خرید ${from} تا ${to}`);
  }

  return chips;
}

export function hasActiveCustomerFilters(filters: CustomerListFilters, search = ""): boolean {
  return Boolean(
    search ||
      filters.population !== "all" ||
      filters.tier ||
      filters.channel ||
      filters.salesLines.length ||
      filters.minPurchases ||
      filters.maxPurchases ||
      filters.lastFrom ||
      filters.lastTo ||
      (filters.sort && filters.sort !== "last_purchase"),
  );
}
