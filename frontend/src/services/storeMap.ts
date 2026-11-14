import type { SaveResult } from "../features/store/autosave";
import type { LayoutResponse, MapProduct, ProductPage, Side, Kind } from "../features/store/types";
import { api, queryPath } from "./api";

export type LayoutDoc = Record<string, unknown>;

export const storeMapService = {
  layout: (branch: string) => api<LayoutResponse>(queryPath("/store-map/layout/", { branch })),
  /** `leaving`: the page is closing, so the request must outlive it (keepalive caps the body at 64 KB). */
  save: (branch: string, doc: LayoutDoc, leaving = false) => {
    const body = JSON.stringify(doc);
    return api<SaveResult>(queryPath("/store-map/layout/", { branch }), { method: "PUT", body, keepalive: leaving && body.length < 60_000 });
  },
  setSlot: (slotId: number, productId: number | null) =>
    api<{ id: number; side: Side; kind: Kind; product: MapProduct | null }>(`/store-map/slots/${slotId}/`, {
      method: "PATCH",
      body: JSON.stringify({ product_id: productId }),
    }),
  products: (q: string, page = 1) => api<ProductPage>(queryPath("/store-map/products/", { q, page })),
};
