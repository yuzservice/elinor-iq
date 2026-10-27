import type { CustomerListParams } from "../../services/customers";

export const SALES_LINE_OPTIONS = [
  { value: "online", label: "وب‌سایت آنلاین", branchCode: "ONLINE" },
  { value: "sari", label: "شعبه ساری", branchCode: "SARI" },
  { value: "gorgan", label: "شعبه گرگان", branchCode: "GORGAN" },
  { value: "capri", label: "شعبه کاپری", branchCode: "CAPRI" },
] as const;

export type SalesLineValue = (typeof SALES_LINE_OPTIONS)[number]["value"];

export const CHANNEL_OPTIONS = [
  { value: "", label: "همه کانال‌ها", icon: "🌐" },
  { value: "online", label: "فقط آنلاین", icon: "💻" },
  { value: "physical", label: "فقط حضوری", icon: "🏬" },
  { value: "both", label: "ترکیبی (Omnichannel)", icon: "🔄" },
] as const;

export const SORT_OPTIONS = [
  { value: "last_purchase", label: "تازه‌ترین خرید", icon: "⏱️" },
  { value: "lifetime_amount", label: "بیشترین مبلغ خرید (LTV)", icon: "💎" },
  { value: "purchase_count", label: "بیشترین تعداد فاکتور", icon: "📈" },
  { value: "churn_risk", label: "بیشترین فاصله از آخرین خرید", icon: "⚠️" },
  { value: "first_purchase", label: "تازه‌ترین مشتریان جذب‌شده", icon: "✨" },
  { value: "name", label: "نام مشتری (الفبا)", icon: "🔤" },
] as const;

export const PURCHASE_VOLUME_PRESETS = [
  { label: "همه", min: "", max: "" },
  { label: "تک‌خرید (۱ بار)", min: "1", max: "1" },
  { label: "تکراری (۲ تا ۵)", min: "2", max: "5" },
  { label: "وفادار (۶+ بار)", min: "6", max: "" },
] as const;

export const LTV_AMOUNT_PRESETS = [
  { label: "همه مبالغ", min: "", max: "" },
  { label: "تا ۲ میلیون", min: "", max: "2000000" },
  { label: "۲ تا ۵ میلیون", min: "2000000", max: "5000000" },
  { label: "بیش از ۵ میلیون", min: "5000000", max: "" },
  { label: "بیش از ۱۰ میلیون (VIP)", min: "10000000", max: "" },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "همه روش‌ها" },
  { value: "installment", label: "خرید اقساطی (اسنپ‌پی / دیجی‌پی)" },
  { value: "snappay", label: "فقط اسنپ‌پی" },
  { value: "digipay", label: "فقط دیجی‌پی" },
  { value: "wallet", label: "کیف پول" },
  { value: "shopino", label: "شاپینو" },
] as const;

export const DISCOUNT_FILTER_OPTIONS = [
  { value: "", label: "همه" },
  { value: "yes", label: "خریداران با تخفیف" },
  { value: "no", label: "فقط خرید بدون تخفیف" },
] as const;

export const ORDER_BEHAVIOR_OPTIONS = [
  { value: "", label: "همه رفتارها" },
  { value: "has_refund", label: "دارای سابقه مرجوعی / تعویض" },
  { value: "has_canceled", label: "دارای سفارش لغوشده آنلاین" },
] as const;

export const PROFILE_STATE_OPTIONS = [
  { value: "", label: "همه پرونده‌ها" },
  { value: "complete", label: "اطلاعات کامل" },
  { value: "incomplete", label: "پرونده ناقص (بدون نام/موبایل)" },
  { value: "has_birth_date", label: "دارای تاریخ تولد" },
] as const;

export const SIZE_PRESETS = ["S", "M", "L", "XL", "2XL", "36", "38", "40", "42", "44", "Free"] as const;

export const CATEGORY_PRESETS = ["مانتو", "شومیز", "شلوار", "کت", "پالتو", "شال", "کفش"] as const;

export const CITY_PRESETS = ["ساری", "گرگان", "تهران", "بابل", "آمل", "قائم‌شهر", "بجنورد"] as const;

export type SmartSegmentId =
  | "all"
  | "vip"
  | "at_risk_vip"
  | "installment"
  | "omnichannel"
  | "discount_hunters"
  | "incomplete_profile";

export const SMART_SEGMENTS: ReadonlyArray<{
  id: SmartSegmentId;
  label: string;
  desc: string;
}> = [
  { id: "all", label: "همه مشتریان", desc: "نمایش کل پایگاه داده بدون فیلتر" },
  { id: "vip", label: "VIP پلاتینیوم", desc: "مشتریان تراز اول با خرید بالای ۱۰ میلیون" },
  { id: "at_risk_vip", label: "طلایی در خطر ریزش", desc: "مشتریان ارزشمند با بیش از ۹۰ روز عدم خرید" },
  { id: "installment", label: "خریداران اقساطی", desc: "پرداخت با اسنپ‌پی یا دیجی‌پی" },
  { id: "omnichannel", label: "مشتریان چندکاناله", desc: "خرید هم‌زمان از وب‌سایت و شعب حضوری" },
  { id: "discount_hunters", label: "حساس به تخفیف", desc: "مشتریانی که از کد یا جشنواره تخفیف استفاده کرده‌اند" },
  { id: "incomplete_profile", label: "پرونده‌های ناقص", desc: "نیازمند تکمیل نام یا شماره موبایل در صندوق" },
];

export type CustomerListFilters = {
  population: string;
  tier: string;
  channel: string;
  salesLines: SalesLineValue[];
  salesLinesMode: "any" | "all";
  minPurchases: string;
  maxPurchases: string;
  minAmount: string;
  maxAmount: string;
  lastFrom: string;
  lastTo: string;
  firstFrom: string;
  firstTo: string;
  paymentMethod: string;
  hasDiscount: string;
  orderBehavior: string;
  size: string;
  category: string;
  city: string;
  profileState: string;
  sort: string;
};

export const EMPTY_CUSTOMER_FILTERS: CustomerListFilters = {
  population: "all",
  tier: "",
  channel: "",
  salesLines: [],
  salesLinesMode: "any",
  minPurchases: "",
  maxPurchases: "",
  minAmount: "",
  maxAmount: "",
  lastFrom: "",
  lastTo: "",
  firstFrom: "",
  firstTo: "",
  paymentMethod: "",
  hasDiscount: "",
  orderBehavior: "",
  size: "",
  category: "",
  city: "",
  profileState: "",
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
    sales_lines_mode:
      filters.salesLines.length > 1 && filters.salesLinesMode ? filters.salesLinesMode : undefined,
    min_purchases: filters.minPurchases || undefined,
    max_purchases: filters.maxPurchases || undefined,
    min_amount: filters.minAmount || undefined,
    max_amount: filters.maxAmount || undefined,
    last_from: filters.lastFrom || undefined,
    last_to: filters.lastTo || undefined,
    first_from: filters.firstFrom || undefined,
    first_to: filters.firstTo || undefined,
    payment_method: filters.paymentMethod || undefined,
    has_discount: filters.hasDiscount || undefined,
    order_behavior: filters.orderBehavior || undefined,
    size: filters.size ? filters.size.trim() : undefined,
    category: filters.category ? filters.category.trim() : undefined,
    city: filters.city ? filters.city.trim() : undefined,
    profile_state: filters.profileState || undefined,
    sort: filters.sort && filters.sort !== "last_purchase" ? filters.sort : undefined,
    page: options.page,
    per_page: options.perPage,
  };
}

export function describeCustomerFilters(
  filters: Partial<CustomerListFilters> & Pick<CustomerListFilters, "population" | "tier" | "channel" | "salesLines" | "minPurchases" | "maxPurchases" | "lastFrom" | "lastTo" | "sort">,
  search = "",
): string[] {
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
  if (filters.minAmount) {
    chips.push(`حداقل مبلغ: ${Number(filters.minAmount).toLocaleString("fa-IR")} تومان`);
  }
  if (filters.maxAmount) {
    chips.push(`حداکثر مبلغ: ${Number(filters.maxAmount).toLocaleString("fa-IR")} تومان`);
  }
  if (filters.lastFrom || filters.lastTo) {
    const from = filters.lastFrom || "…";
    const to = filters.lastTo || "…";
    chips.push(`آخرین خرید ${from} تا ${to}`);
  }
  if (filters.paymentMethod) {
    const label = PAYMENT_METHOD_OPTIONS.find((p) => p.value === filters.paymentMethod)?.label || filters.paymentMethod;
    chips.push(`پرداخت: ${label}`);
  }
  if (filters.size) {
    chips.push(`سایز: ${filters.size}`);
  }
  if (filters.category) {
    chips.push(`دسته: ${filters.category}`);
  }
  if (filters.city) {
    chips.push(`شهر: ${filters.city}`);
  }

  return chips;
}

export function hasActiveCustomerFilters(filters: Partial<CustomerListFilters>, search = ""): boolean {
  return Boolean(
    search ||
      (filters.population && filters.population !== "all") ||
      filters.tier ||
      filters.channel ||
      filters.salesLines?.length ||
      filters.minPurchases ||
      filters.maxPurchases ||
      filters.minAmount ||
      filters.maxAmount ||
      filters.lastFrom ||
      filters.lastTo ||
      filters.firstFrom ||
      filters.firstTo ||
      filters.paymentMethod ||
      filters.hasDiscount ||
      filters.orderBehavior ||
      filters.size ||
      filters.category ||
      filters.city ||
      filters.profileState ||
      (filters.sort && filters.sort !== "last_purchase"),
  );
}
