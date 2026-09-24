import { api, queryPath } from "./api";
import type { Paginated, SalesLineKey, SalesOrder, SalesProductRow, SalesSummary, TrendGroup } from "../types";

export type SalesFilterOptionsResponse = {
  branches: { key: string; label: string }[];
  channels: { key: string; label: string }[];
  payment_methods: { key: string; label: string; scope?: "online" | "pos" }[];
  timing_ms?: number;
};

export type SalesLineFilter = SalesLineKey | "all";
export type ProductSort = "units" | "purchases" | "customers" | "last_sale" | "title";
export type SalesSection = "overview" | "trend" | "details";

export type SalesKpiMetric = {
  value: number;
  compare_value: number | null;
  change_pct: number | null;
};

export type SalesOverviewKpisResponse = {
  window: {
    start: string;
    end: string;
    from: string;
    to: string;
    label: string;
  };
  compare_window: SalesOverviewKpisResponse["window"] | null;
  filters: {
    branches: string[];
    channels: string[];
    payments: string[];
  };
  kpis: {
    net_sales: SalesKpiMetric;
    order_count: SalesKpiMetric;
    items_sold: SalesKpiMetric;
    avg_order_amount: SalesKpiMetric;
    avg_items_per_order: SalesKpiMetric;
    refund_amount: SalesKpiMetric;
    refund_rate_pct: SalesKpiMetric;
  };
  timing_ms?: number;
};

export type SalesKpiParams = {
  from?: string;
  to?: string;
  branches?: string;
  channels?: string;
  payments?: string;
  compare_from?: string;
  compare_to?: string;
};

export const salesService = {
  filterOptions: () => api<SalesFilterOptionsResponse>("/sales/filters/"),
  overviewKpis: (params: SalesKpiParams) =>
    api<SalesOverviewKpisResponse>(
      queryPath("/sales/kpis/", {
        from: params.from,
        to: params.to,
        branches: params.branches || undefined,
        channels: params.channels || undefined,
        payments: params.payments || undefined,
        compare_from: params.compare_from,
        compare_to: params.compare_to,
      }),
    ),
  summary: (
    from?: string,
    to?: string,
    salesLine: SalesLineFilter = "all",
    group: TrendGroup = "daily",
    section: SalesSection = "overview",
  ) =>
    api<SalesSummary>(
      queryPath("/sales/summary/", {
        from,
        to,
        sales_line: salesLine === "all" ? undefined : salesLine,
        group,
        section,
      }),
    ),
  orders: (from?: string, to?: string, page = 1, salesLine: SalesLineFilter = "all") =>
    api<Paginated<SalesOrder>>(
      queryPath("/sales/orders/", {
        from,
        to,
        page,
        per_page: 20,
        sales_line: salesLine === "all" ? undefined : salesLine,
      }),
    ),
  products: (
    from?: string,
    to?: string,
    salesLine: SalesLineFilter = "all",
    page = 1,
    search = "",
    sort: ProductSort = "units",
    order: "asc" | "desc" = "desc",
  ) =>
    api<Paginated<SalesProductRow>>(
      queryPath("/sales/products/", {
        from,
        to,
        page,
        per_page: 20,
        search: search || undefined,
        sort,
        order,
        sales_line: salesLine === "all" ? undefined : salesLine,
      }),
    ),
};
