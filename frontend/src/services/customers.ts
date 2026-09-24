import { api, queryPath } from "./api";
import type { Customer360, CustomerPurchase, CustomerReports, CustomerRow, Paginated, CustomerProductHistory } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

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

export function customerExportQuery(params: CustomerListParams): string {
  return queryPath("/customers/export/", {
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
    sort: params.sort,
  });
}

async function downloadExport(path: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = data && typeof data === "object" && "detail" in data ? String(data.detail) : "";
    throw new Error(detail || "خروجی اکسل با خطا مواجه شد.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || fallbackFilename;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const customersService = {
  reports: () => api<CustomerReports>("/customers/reports/"),
  list: (params: CustomerListParams) => api<Paginated<CustomerRow>>(customerListQuery(params)),
  exportList: (params: CustomerListParams) =>
    downloadExport(customerExportQuery(params), `customers-${new Date().toISOString().slice(0, 10)}.xlsx`),
  detail: (id: number) => api<Customer360>(`/customers/${id}/`),
  purchases: (id: number, page = 1, perPage = 20) =>
    api<Paginated<CustomerPurchase> & { id: number }>(
      queryPath(`/customers/${id}/purchases/`, { page, per_page: perPage }),
    ),
  products: (id: number) =>
    api<{ id: number; total: number; results: CustomerProductHistory[] }>(`/customers/${id}/products/`),
};
