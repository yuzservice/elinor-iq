import { api, queryPath } from "./api";
import type { Paginated, SalesLineKey, SalesOrder, SalesProductRow, SalesSummary, TrendGroup } from "../types";

export type SalesLineFilter = SalesLineKey | "all";
export type ProductSort = "units" | "purchases" | "customers" | "last_sale" | "title";

export const salesService = {
  summary: (from?: string, to?: string, salesLine: SalesLineFilter = "all", group: TrendGroup = "daily") =>
    api<SalesSummary>(
      queryPath("/sales/summary/", { from, to, sales_line: salesLine === "all" ? undefined : salesLine, group }),
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
