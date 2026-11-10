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
