import { api, queryPath } from "./api";
import type { BundlePairs, ProductDetail, ProductsSummary, ProductsTable } from "../features/products/types";
import type {
  Product360Data,
  ProductBundle,
  ProductSizeColor,
  ProductsListResponse,
  SalesLineKey,
} from "../types";

export type ProductListParams = {
  page?: number;
  per_page?: number;
  search?: string;
  sales_line?: SalesLineKey | "all";
  tab?: "all" | "bestsellers" | "slowmovers" | "velocity" | "bundles" | "variants";
  sort?: "units" | "revenue" | "last_sale" | "title" | "velocity" | "sell_through";
  order?: "asc" | "desc";
  from?: string;
  to?: string;
};

type Params = Record<string, string | number | undefined>;

export const productsService = {
  summary: (params: Params) => api<ProductsSummary>(queryPath("/products/summary/", params)),
  table: (params: Params) => api<ProductsTable>(queryPath("/products/table/", params)),
  pairs: (params: Params) => api<BundlePairs>(queryPath("/products/pairs/", params)),
  detail: (id: number, params: Params) => api<ProductDetail>(queryPath(`/products/${id}/`, params)),
  callList: (id: number, kind: "buyers" | "prospects") =>
    api<{ list_id: number; program_id: number; name: string }>(`/products/${id}/call-list/`, { method: "POST", body: JSON.stringify({ kind }) }),
  list: (params: ProductListParams | number = 1, search = "") => {
    if (typeof params === "number") {
      return api<ProductsListResponse>(
        queryPath("/products/", { page: params, search, per_page: 20 }),
      );
    }
    const {
      page = 1,
      per_page = 20,
      search: s = "",
      sales_line,
      tab = "all",
      sort = "units",
      order = "desc",
      from,
      to,
    } = params;

    const query: Record<string, string | number | undefined> = {
      page,
      per_page,
      search: s || undefined,
      tab: tab !== "all" ? tab : undefined,
      sort,
      order,
      from,
      to,
    };
    if (sales_line && sales_line !== "all") {
      query.sales_line = sales_line;
    }

    return api<ProductsListResponse>(queryPath("/products/", query));
  },

  bundles: (from?: string, to?: string, limit = 5) =>
    api<{ total_multi_item_baskets: number; bundles: ProductBundle[] }>(
      queryPath("/products/bundles/", { from, to, limit }),
    ),

  sizeColor: (from?: string, to?: string, sales_line?: SalesLineKey | "all") => {
    const query: Record<string, string | undefined> = { from, to };
    if (sales_line && sales_line !== "all") {
      query.sales_line = sales_line;
    }
    return api<ProductSizeColor>(queryPath("/products/size-color/", query));
  },

  get360: (id: number) => api<Product360Data>(`/products/${id}/360/`),
};
