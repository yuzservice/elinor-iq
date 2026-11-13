export type LineKey = "ONLINE" | "SARI" | "GORGAN" | "CAPRI";
export type ProductStatus = "driver" | "growth" | "normal" | "slow" | "stale";

export type ProductReportRow = {
  id: number;
  title: string;
  code: string;
  category: string;
  status: ProductStatus;
  stock_flag?: "" | "charge" | "out"; // only while stock is enabled
  central_stock?: number | null;
  units: number;
  net_units: number;
  revenue: number;
  speed: number;
  first14: number;
  ratio: number | null;
  change: number | null;
  trend: number | null;
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
  stock_enabled: boolean;
  drivers: { count: number; top: ProductReportRow[] };
  charge?: { count: number; top: ProductReportRow[] }; // stock enabled
  growth?: { count: number; top: ProductReportRow[] }; // stock disabled
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
  | { kind: "forecast"; units: number; lead: number; per_day: number; fastest: { size: string; color: string; need: number }[] }
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
  stock_enabled: boolean;
  stock_flag?: "" | "charge" | "out";
  central_stock?: number | null;
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

export type SizeColor = {
  range: { from: string; to: string };
  category_id: number | null;
  categories: { id: number; label: string }[];
  total_units: number;
  no_size_share: number | null;
  no_color_share: number | null;
  sizes: { label: string; units: number; share: number | null }[];
  colors: { label: string; hex: string | null; units: number; share: number | null }[];
};

type ReturnCounts = {
  refund_invoices: number; exchange_invoices: number; refunded_units: number; replacement_units: number; refunded_amount: number;
  sold_units: number; rate: number | null;
};

export type ReturnsBreakdown = {
  range: { from: string; to: string; compare_from: string | null; compare_to: string | null; compare: string; comparable: boolean };
  online_note: string;
  totals: ReturnCounts & { refunded_amount_share: number | null; rate_points: number | null };
  branches: (ReturnCounts & { line: LineKey })[];
  products: { id: number; title: string; category: string; units: number; returned: number; rate: number }[];
};
