import type { HoursData, PostDetail, PostList, ProductDetail, ProductList, PulseHome, PulseStatus } from "../features/pulse/types";
import { api, queryPath } from "./api";

export type PostFilters = { kind?: string; sort?: string; page?: number; from?: string; to?: string; hour?: string; code?: string };

export const pulseService = {
  status: () => api<PulseStatus>("/pulse/status/"),
  home: () => api<PulseHome>("/pulse/home/"),
  toggleTask: (id: number) => api<{ id: number; done: boolean }>(`/pulse/tasks/${id}/toggle/`, { method: "POST" }),
  posts: (filters: PostFilters) => api<PostList>(queryPath("/pulse/posts/", filters)),
  post: (id: number) => api<PostDetail>(`/pulse/posts/${id}/`),
  products: () => api<ProductList>("/pulse/products/"),
  product: (code: string) => api<ProductDetail>(`/pulse/products/${code}/`),
  hours: (group: "reel" | "all") => api<HoursData>(queryPath("/pulse/hours/", { group })),
};
