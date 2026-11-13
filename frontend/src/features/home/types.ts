import type { LineKey } from "../products/types";

export type TargetScope = "month" | "quarter" | "year";
export type LineStatus = "ahead" | "on_plan" | "behind" | null;

export type TargetProgress = {
  scope: TargetScope;
  label: string;
  start: string;
  end: string;
  today: string;
  elapsed_days: number;
  total_days: number;
  remaining_days: number;
  expected_pct: number;
  has_target: boolean;
  can_edit: boolean;
  company: {
    target: number; actual: number; pct: number; gap: number; pace: "ahead" | "behind"; forecast: number; avg_daily: number;
    required_daily: number | null; lines_included: LineKey[];
  } | null;
  lines: { line: LineKey; target: number | null; actual: number; pct: number | null; gap: number | null; status: LineStatus }[];
};

export type TargetGrid = {
  year: number;
  months: { month: number; name: string; lines: Record<LineKey, number | null> }[];
  changes: { month: number; sales_line: LineKey; old: number | null; new: number | null; source: string; by: string | null; at: string }[];
  changed?: number;
};

export type CopyPreview = {
  year: number;
  growth_pct: number;
  cells: { month: number; sales_line: LineKey; amount: number | null; source: "target" | "sales" | "incomplete"; base: number | null }[];
};

export type HomePeriodKey = "today" | "yesterday" | "7" | "30" | "90" | "custom";
export type HomeCompare = "prev" | "yoy" | "none";
type Change = { value: number | null; change: number | null };
type BranchRow = { sales: number; invoices: number; items: number; basket: number | null; change: number | null; compare_sales: number | null };

export type HomeData = {
  range: {
    period: HomePeriodKey; from: string; to: string; bucket: "hour" | "day"; compare: HomeCompare;
    compare_from: string | null; compare_to: string | null; comparable: boolean; lines: LineKey[];
  };
  sync: { last_success_at: string | null; failed: { started_at: string; kind: string } | null };
  cards: {
    sales: Change & { online_share: number | null };
    invoices: Change & { items: number };
    basket: Change;
    buyers: Change & { new_share: number | null };
  };
  branches: (BranchRow & { line: LineKey })[];
  total: BranchRow | null;
  trend: {
    key: string | number; future: boolean; sales: number | null; compare?: number;
    invoices?: number; items?: number; lines?: Partial<Record<LineKey, number>>;
  }[];
  attention: AttentionItem[];
};

export type AttentionItem =
  | { kind: "target"; lines: LineKey[]; worst: { line: LineKey; pct: number; gap: number }; required_daily: number | null; avg_daily: number; link: string }
  | { kind: "drivers"; count: number; names: string[]; link: string }
  | { kind: "calls"; overdue: number; escalations: number; link: string }
  | { kind: "tier_drop"; count: number; since: string; from: string; titles: string[]; link: string }
  | { kind: "sync_failed"; at: string; sync_kind: string; link: string };
