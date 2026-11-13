import { api, queryPath } from "./api";
import type { BundlePairs, ProductDetail, ProductsSummary, ProductsTable, ReturnsBreakdown, SizeColor } from "../features/products/types";

type Params = Record<string, string | number | undefined>;

export const productsService = {
  summary: (params: Params) => api<ProductsSummary>(queryPath("/products/summary/", params)),
  table: (params: Params) => api<ProductsTable>(queryPath("/products/table/", params)),
  pairs: (params: Params) => api<BundlePairs>(queryPath("/products/pairs/", params)),
  sizeColor: (params: Params) => api<SizeColor>(queryPath("/products/size-color/", params)),
  returns: (params: Params) => api<ReturnsBreakdown>(queryPath("/products/returns/", params)),
  detail: (id: number, params: Params) => api<ProductDetail>(queryPath(`/products/${id}/`, params)),
  callList: (id: number, kind: "buyers" | "prospects") =>
    api<{ list_id: number; program_id: number; name: string }>(`/products/${id}/call-list/`, { method: "POST", body: JSON.stringify({ kind }) }),
};
