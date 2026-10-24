import { api, queryPath } from "./api";
import type {
  Customer360,
  CustomerPurchase,
  CustomerReports,
  CustomerRow,
  Paginated,
  CustomerProductHistory,
  PublicTier,
  TierRules,
  TierRulesPreview,
  TierRulesState,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export type CustomerListParams = {
  search?: string;
  population?: string;
  tier?: string;
  channel?: string;
  sales_line?: string;
  sales_lines?: string;
  sales_lines_mode?: "any" | "all";
  min_purchases?: string;
  max_purchases?: string;
  min_amount?: string;
  max_amount?: string;
  last_from?: string;
  last_to?: string;
  first_from?: string;
  first_to?: string;
  payment_method?: string;
  has_discount?: string;
  order_behavior?: string;
  size?: string;
  category?: string;
  city?: string;
  profile_state?: string;
  birth_month?: string;
  page?: number;
  per_page?: number;
  sort?: string;
};

function serializeFilterParams(params: CustomerListParams) {
  return {
    search: params.search,
    population: params.population,
    tier: params.tier,
    channel: params.channel,
    sales_line: params.sales_line,
    sales_lines: params.sales_lines,
    sales_lines_mode: params.sales_lines_mode,
    min_purchases: params.min_purchases,
    max_purchases: params.max_purchases,
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    last_from: params.last_from,
    last_to: params.last_to,
    first_from: params.first_from,
    first_to: params.first_to,
    payment_method: params.payment_method,
    has_discount: params.has_discount,
    order_behavior: params.order_behavior,
    size: params.size,
    category: params.category,
    city: params.city,
    profile_state: params.profile_state,
    birth_month: params.birth_month,
    sort: params.sort,
  };
}

export function customerListQuery(params: CustomerListParams): string {
  return queryPath("/customers/", {
    ...serializeFilterParams(params),
    page: params.page || 1,
    per_page: params.per_page || 20,
  });
}

export function customerExportQuery(params: CustomerListParams): string {
  return queryPath("/customers/export/", serializeFilterParams(params));
}

async function downloadExport(path: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const raw = await response.text();
    let detail = "";
    try {
      const data = raw ? JSON.parse(raw) : {};
      if (data && typeof data === "object" && "detail" in data) {
        detail = String(data.detail);
      }
    } catch {
      detail = raw.trim();
    }
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
  refreshTiers: () =>
    api<{ started: boolean; detail: string }>("/customers/refresh-tiers/", { method: "POST" }),
  tierRefreshStatus: () =>
    api<{ running: boolean; last_date: string | null; finished_at: string | null }>("/customers/refresh-tiers/"),
  exportList: (params: CustomerListParams) =>
    downloadExport(customerExportQuery(params), `customers-${new Date().toISOString().slice(0, 10)}.csv`),
  detail: (id: number) => api<Customer360>(`/customers/${id}/`),
  purchases: (id: number, page = 1, perPage = 20) =>
    api<Paginated<CustomerPurchase> & { id: number }>(
      queryPath(`/customers/${id}/purchases/`, { page, per_page: perPage }),
    ),
  products: (id: number) =>
    api<{ id: number; total: number; results: CustomerProductHistory[] }>(`/customers/${id}/products/`),
  tiers: () => api<{ results: PublicTier[] }>("/customers/tiers/"),
  tierRules: () => api<TierRulesState>("/customers/tier-rules/"),
  saveTierRulesDraft: (payload: { rules?: TierRules; note?: string }) =>
    api<TierRulesState>("/customers/tier-rules/draft/", { method: "PUT", body: JSON.stringify(payload) }),
  deleteTierRulesDraft: () => api<TierRulesState>("/customers/tier-rules/draft/", { method: "DELETE" }),
  previewTierRulesDraft: () => api<TierRulesPreview>("/customers/tier-rules/draft/preview/", { method: "POST" }),
  activateTierRulesDraft: () =>
    api<{ started: boolean; detail: string; version?: number }>("/customers/tier-rules/draft/activate/", {
      method: "POST",
    }),
  restoreTierRules: (version: number) =>
    api<TierRulesState>(`/customers/tier-rules/${version}/restore/`, { method: "POST" }),
};
