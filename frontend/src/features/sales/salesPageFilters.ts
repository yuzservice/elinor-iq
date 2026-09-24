import type { SalesLineFilter } from "../../services/sales";

export const SALES_BRANCH_OPTIONS = [
  { value: "all", label: "همه شعبه‌ها" },
  { value: "SARI", label: "ساری" },
  { value: "GORGAN", label: "گرگان" },
  { value: "CAPRI", label: "کاپری" },
] as const;

export const SALES_CHANNEL_OPTIONS = [
  { value: "all", label: "همه کانال‌ها" },
  { value: "ONLINE", label: "آنلاین" },
  { value: "PHYSICAL", label: "حضوری" },
] as const;

export type SalesBranchFilter = (typeof SALES_BRANCH_OPTIONS)[number]["value"];
export type SalesChannelFilter = (typeof SALES_CHANNEL_OPTIONS)[number]["value"];

export type SalesFilterValues = {
  from: string;
  to: string;
  branch: SalesBranchFilter;
  channel: SalesChannelFilter;
  compareEnabled: boolean;
  compareFrom: string;
  compareTo: string;
};

export const EMPTY_SALES_FILTERS: SalesFilterValues = {
  from: "",
  to: "",
  branch: "all",
  channel: "all",
  compareEnabled: false,
  compareFrom: "",
  compareTo: "",
};

export function deriveSalesLineFilter(
  branch: SalesBranchFilter,
  channel: SalesChannelFilter,
): SalesLineFilter {
  if (channel === "ONLINE") return "ONLINE";
  if (branch !== "all") return branch;
  return "all";
}

export function isBranchFilterDisabled(channel: SalesChannelFilter): boolean {
  return channel === "ONLINE";
}
