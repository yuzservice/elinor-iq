import { api, queryPath } from "./api";
import type { Paginated, ProductRow } from "../types";

export const productsService = {
  list: (page = 1, search = "") =>
    api<Paginated<ProductRow>>(
      queryPath("/products/", { page, search, per_page: 20 }),
    ),
};
