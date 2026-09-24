import { api, queryPath } from "./api";
import type { Customer360, CustomerPurchase, CustomerReports, CustomerRow, Paginated, CustomerProductHistory } from "../types";

export type CustomerListParams = {
  search?: string;
  population?: string;
  tier?: string;
  channel?: string;
  sales_line?: string;
  sales_lines?: string;
  min_purchases?: string;
  max_purchases?: string;
  last_from?: string;
  last_to?: string;
  page?: number;
  per_page?: number;
  sort?: string;
};

export function customerListQuery(params: CustomerListParams): string {
  return queryPath("/customers/", {
    search: params.search,
    population: params.population,
    tier: params.tier,
    channel: params.channel,
    sales_line: params.sales_line,
    sales_lines: params.sales_lines,
    min_purchases: params.min_purchases,
    max_purchases: params.max_purchases,
    last_from: params.last_from,
    last_to: params.last_to,
    page: params.page || 1,
    per_page: params.per_page || 20,
    sort: params.sort,
  });
}

export const customersService = {
  reports: () => api<CustomerReports>("/customers/reports/"),
  list: (params: CustomerListParams) => api<Paginated<CustomerRow>>(customerListQuery(params)),
  detail: (id: number) => api<Customer360>(`/customers/${id}/`),
  purchases: (id: number, page = 1, perPage = 20) =>
    api<Paginated<CustomerPurchase> & { id: number }>(
      queryPath(`/customers/${id}/purchases/`, { page, per_page: perPage }),
    ),
  products: (id: number) =>
    api<{ id: number; total: number; results: CustomerProductHistory[] }>(`/customers/${id}/products/`),
};
