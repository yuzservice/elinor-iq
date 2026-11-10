export type LineKey = "ONLINE" | "SARI" | "GORGAN" | "CAPRI";
export type ProductStatus = "driver" | "growth" | "normal" | "slow" | "stale";

export type ProductReportRow = {
  id: number;
  title: string;
  code: string;
  category: string;
  status: ProductStatus;
  stock_flag: "" | "charge" | "out";
  central_stock: number | null;
  units: number;
  net_units: number;
  revenue: number;
  speed: number;
  first14: number;
  ratio: number | null;
  change: number | null;
  age: number;
  discount_share: number | null;
  return_rate: number | null;
  first_sale_date: string;
  last_sale_date: string;
  lines: Record<LineKey, number>;
  spark?: number[];
};

export type ProductsSummary = {
  range: { from: string; to: string; compare_from: string | null; compare_to: string | null; compare: string; comparable: boolean; as_of: string | null };
  filtered: boolean;
  products: number;
  sales: { revenue: number; net_units: number; avg_price: number | null; revenue_change: number | null; units_change: number | null };
  drivers: { count: number; top: ProductReportRow[] };
  charge: { count: number; top: ProductReportRow[] };
  slow: { count: number; top: ProductReportRow[] };
  branches: { line: LineKey; revenue: number; share: number; change: number | null }[];
};

export type ProductsTable = { full: boolean; page: number; page_size: number; total: number; sort: string; dir: "asc" | "desc"; results: ProductReportRow[] };

export type BundlePair = {
  a: number; b: number; a_name: string; b_name: string; baskets: number; confidence: number; lift: number; trend: number | null; new: boolean; early: boolean;
};
export type BundlePairs = { level: "product" | "category"; channel: "all" | "store" | "online"; comparable: boolean; results: BundlePair[] };

export type BranchRow = { line: LineKey; units: number; share: number | null; index: number | null; last_sale: string | null };
export type ProductTip =
  | { kind: "charge"; need: number; lead: number; per_day: number; central: number; dropped: boolean; needs: { size: string; color: string; need: number }[] }
  | { kind: "branch"; best: BranchRow; worst: BranchRow | null }
  | { kind: "bundle"; pair: BundlePair; comparable: boolean }
  | { kind: "no_discount" | "try_discount"; share: number }
  | { kind: "prospects"; count: number; days: number };

export type ProductDetail = {
  id: number;
  title: string;
  code: string;
  status: ProductStatus | null;
  stock_flag: "" | "charge" | "out";
  central_stock: number | null;
  category: { id: number | null; title: string; path: string };
  first_sale_date: string | null;
  age: number | null;
  price: number | null;
  range: { from: string; to: string; compare_from: string | null; compare_to: string | null; compare: string; comparable: boolean };
  kpis: {
    revenue: number; units: number; net_units: number; speed: number; revenue_change: number | null; units_change: number | null; ratio: number | null;
    first14: number | null; first14_rank: number | null; return_rate: number | null; discount_share: number | null;
  };
  tips: ProductTip[];
  daily: { day: string; units: number }[];
  category_day: number | null;
  sizes: { color: string; size: string; units: number }[];
  size_days: number;
  branches: BranchRow[];
  pairs: BundlePairs;
  buyers: { buyers: number; new_share: number; repeat_share: number; avg_basket: number | null; tiers: { code: string; label: string; count: number }[] } | null;
  prospects: number;
};
