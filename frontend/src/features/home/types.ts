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

export type HomePeriodKey = "today" | "7" | "30" | "90" | "custom";
type Card = { value: number | null; change: number | null; spark: number[] };

export type HomeData = {
  range: { from: string; to: string; compare_from: string; compare_to: string; bucket: "hour" | "day"; comparable: boolean };
  sync: { last_success_at: string | null; failed: { started_at: string; kind: string } | null };
  today: {
    sales: number; invoices: number; buyers: number; sales_change: number | null; invoices_change: number | null; buyers_change: number | null;
    last_hour_sales: number; compare_day: string;
  };
  trend: { current: { at: string; sales: number }[]; compare: number[] };
  branches: { line: LineKey; sales: number; invoices: number; basket: number | null; change: number | null }[];
  cards: {
    sales: Card & { online_share: number | null };
    invoices: Card & { online: number; in_store: number };
    basket: Card & { best_line: LineKey | null; best_value: number | null };
    buyers: Card & { new_share: number | null };
  };
  attention: AttentionItem[];
};

export type AttentionItem =
  | { kind: "target"; lines: LineKey[]; worst: { line: LineKey; pct: number; gap: number }; required_daily: number | null; avg_daily: number; link: string }
  | { kind: "drivers"; count: number; names: string[]; link: string }
  | { kind: "calls"; overdue: number; escalations: number; link: string }
  | { kind: "tier_drop"; count: number; since: string; link: string }
  | { kind: "sync_failed"; at: string; sync_kind: string; link: string };
