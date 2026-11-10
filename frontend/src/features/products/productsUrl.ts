/** Products page state, kept entirely in the URL (defaults are omitted). */

export type Period = "7" | "30" | "90" | "365" | "custom";
export type Compare = "prev" | "year" | "custom" | "none";
export type ListKey = "lines" | "status" | "age" | "stock" | "discount";

export type ProductsState = {
  period: Period;
  from: string;
  to: string;
  compare: Compare;
  cfrom: string;
  cto: string;
  q: string;
  category_ids: number[];
  lines: string[];
  status: string[];
  age: string[];
  stock: string[];
  discount: string[];
  sort: string;
  dir: "asc" | "desc";
  page: number;
  all: boolean;
  bch: "all" | "store" | "online";
  blev: "product" | "category";
  bnew: boolean;
};

export const DEFAULT_STATE: ProductsState = {
  period: "30", from: "", to: "", compare: "prev", cfrom: "", cto: "", q: "", category_ids: [], lines: [], status: [], age: [],
  stock: [], discount: [], sort: "revenue", dir: "desc", page: 1, all: false, bch: "all", blev: "product", bnew: false,
};

const LISTS: ListKey[] = ["lines", "status", "age", "stock", "discount"];
const PERIODS: Period[] = ["7", "30", "90", "365", "custom"];
const COMPARES: Compare[] = ["prev", "year", "custom", "none"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const list = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);
const iso = (value: string | null) => (value && ISO.test(value) ? value : "");

export function parseState(search: string): ProductsState {
  const p = new URLSearchParams(search);
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T) => (allowed.includes(p.get(key) as T) ? (p.get(key) as T) : fallback);
  const state: ProductsState = {
    ...DEFAULT_STATE,
    period: pick("period", PERIODS, "30"),
    from: iso(p.get("from")),
    to: iso(p.get("to")),
    compare: pick("compare", COMPARES, "prev"),
    cfrom: iso(p.get("cfrom")),
    cto: iso(p.get("cto")),
    q: p.get("q") ?? "",
    category_ids: list(p.get("category_ids")).map(Number).filter((n) => Number.isInteger(n) && n > 0),
    sort: p.get("sort") || "revenue",
    dir: p.get("dir") === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(p.get("page")) || 1),
    all: p.get("all") === "1",
    bch: pick("bch", ["all", "store", "online"] as const, "all"),
    blev: pick("blev", ["product", "category"] as const, "product"),
    bnew: p.get("bnew") === "1",
  };
  LISTS.forEach((key) => (state[key] = list(p.get(key))));
  if (state.period === "custom" && !(state.from && state.to)) state.period = "30";
  if (state.compare === "custom" && !(state.cfrom && state.cto)) state.compare = "prev";
  return state;
}

export function serializeState(state: ProductsState): string {
  const p = new URLSearchParams();
  const put = (key: string, value: string, fallback = "") => value !== fallback && p.set(key, value);
  put("period", state.period, "30");
  if (state.period === "custom") (put("from", state.from), put("to", state.to));
  put("compare", state.compare, "prev");
  if (state.compare === "custom") (put("cfrom", state.cfrom), put("cto", state.cto));
  put("q", state.q.trim());
  put("category_ids", state.category_ids.join(","));
  LISTS.forEach((key) => put(key, state[key].join(",")));
  put("sort", state.sort, "revenue");
  put("dir", state.dir, "desc");
  put("page", String(state.page), "1");
  put("all", state.all ? "1" : "");
  put("bch", state.bch, "all");
  put("blev", state.blev, "product");
  put("bnew", state.bnew ? "1" : "");
  return p.toString();
}

/** Any filter (not period, comparison or sort) turns the top-10 view into the full paged list. */
export function isFiltered(state: ProductsState) {
  return Boolean(state.q.trim() || state.category_ids.length || LISTS.some((key) => state[key].length));
}

export function clearFilters(state: ProductsState): ProductsState {
  return { ...state, q: "", category_ids: [], lines: [], status: [], age: [], stock: [], discount: [], page: 1, all: false };
}

/** Query parameters for /api/products/summary|table|pairs/. */
export function apiParams(state: ProductsState): Record<string, string | number | undefined> {
  return {
    period: state.period, from: state.period === "custom" ? state.from : undefined, to: state.period === "custom" ? state.to : undefined,
    compare: state.compare, cfrom: state.compare === "custom" ? state.cfrom : undefined, cto: state.compare === "custom" ? state.cto : undefined,
    q: state.q.trim(), category_ids: state.category_ids.join(","), lines: state.lines.join(","), status: state.status.join(","),
    age: state.age.join(","), stock: state.stock.join(","), discount: state.discount.join(","),
    sort: state.sort, dir: state.dir, page: state.page, all: state.all ? "1" : undefined,
  };
}

/** Toggle a whole list value (cards, branch strip, shortcuts): same value again clears it. */
export function toggleList(state: ProductsState, key: ListKey, values: string[], extra: Partial<ProductsState> = {}): ProductsState {
  const same = state[key].join(",") === values.join(",");
  return { ...state, [key]: same ? [] : values, page: 1, ...(same ? {} : extra) };
}
