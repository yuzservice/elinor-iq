export const TIER_OPTIONS = [
  { value: "VIP", label: "VIP" },
  { value: "DIAMOND", label: "الماس" },
  { value: "GOLD_1", label: "طلایی سطح ۱" },
  { value: "GOLD_2", label: "طلایی سطح ۲" },
  { value: "SILVER", label: "نقره‌ای" },
  { value: "BRONZE_1", label: "برنزی سطح ۱" },
  { value: "BRONZE_2", label: "برنزی سطح ۲" },
  { value: "BRONZE_3", label: "برنزی سطح ۳" },
] as const;

export const SALES_LINE_OPTIONS = [
  { value: "online", label: "آنلاین" },
  { value: "sari", label: "ساری" },
  { value: "gorgan", label: "گرگان" },
  { value: "capri", label: "کاپری" },
] as const;

export type SalesLineValue = (typeof SALES_LINE_OPTIONS)[number]["value"];

export type CustomerListFilters = {
  population: string;
  tier: string;
  salesLines: SalesLineValue[];
  minPurchases: string;
  maxPurchases: string;
  lastFrom: string;
  lastTo: string;
};

export const EMPTY_CUSTOMER_FILTERS: CustomerListFilters = {
  population: "all",
  tier: "",
  salesLines: [],
  minPurchases: "",
  maxPurchases: "",
  lastFrom: "",
  lastTo: "",
};

export function salesLinesToParam(salesLines: SalesLineValue[]): string {
  return salesLines.join(",");
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
      filters.salesLines.length ||
      filters.minPurchases ||
      filters.maxPurchases ||
      filters.lastFrom ||
      filters.lastTo,
  );
}
