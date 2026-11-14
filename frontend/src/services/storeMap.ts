import type { LayoutResponse, MapProduct, ProductPage, ServerRack, Slot, TemplateResult } from "../features/store/types";
import { api, queryPath } from "./api";

export type LayoutDoc = Record<string, unknown>;
export type LayoutSaved = { version: number; created: Record<string, ServerRack> };

/** `leaving`: the page is closing, so the request must outlive it (keepalive caps the body at 64 KB). */
const send = (path: string, method: string, doc: LayoutDoc, leaving = false) => {
  const body = JSON.stringify(doc);
  return { method, body, keepalive: leaving && body.length < 60_000, path };
};

export const storeMapService = {
  layout: (branch: string) => api<LayoutResponse>(queryPath("/store-map/layout/", { branch })),
  save: (branch: string, doc: LayoutDoc, leaving = false) => {
    const { path, ...init } = send(queryPath("/store-map/layout/", { branch }), "PUT", doc, leaving);
    return api<LayoutSaved>(path, init);
  },
  createTemplate: (branch: string, doc: LayoutDoc) => {
    const { path, ...init } = send(queryPath("/store-map/templates/", { branch }), "POST", doc);
    return api<TemplateResult>(path, init);
  },
  saveTemplate: (branch: string, id: number, doc: LayoutDoc, leaving = false) => {
    const { path, ...init } = send(queryPath(`/store-map/templates/${id}/`, { branch }), "PUT", doc, leaving);
    return api<TemplateResult>(path, init);
  },
  deleteTemplate: (branch: string, id: number, version: number | null) =>
    api<{ version: number }>(queryPath(`/store-map/templates/${id}/`, { branch, version: version ?? undefined }), { method: "DELETE" }),
  setSlot: (slotId: number, productId: number | null) =>
    api<Slot>(`/store-map/slots/${slotId}/`, { method: "PATCH", body: JSON.stringify({ product_id: productId }) }),
  products: (q: string, page = 1) => api<ProductPage>(queryPath("/store-map/products/", { q, page })),
};

export type { MapProduct };
