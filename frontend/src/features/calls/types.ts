export type AfterSave = "close" | "retry" | "dnc";
export type FieldType = "single" | "multi" | "toggle" | "text" | "long_text" | "number" | "rating" | "date" | "time";

export type FormOption = { id: string; title: string; is_active: boolean; tag_ids?: number[] };
export type FormField = {
  id: string;
  type: FieldType;
  title: string;
  required?: boolean;
  creates_followup?: boolean;
  options?: FormOption[];
};
export type FormOutcome = {
  id: string;
  title: string;
  is_active: boolean;
  connected: boolean;
  after_save: AfterSave;
  retry_times?: number;
  retry_gap?: number;
  retry_unit?: "day" | "hour";
  no_call_days?: number | null;
  escalate?: boolean;
  tag_ids?: number[];
  fields: FormField[];
};
export type FormSchema = { outcomes: FormOutcome[] };

export type Answers = Record<string, unknown>;
export type AnswerEntry = { type: FieldType; title: string; value: unknown; labels?: string[] };

export type TaskRow = {
  id: number;
  customer: { source_id: number; name: string; tier: string | null };
  program: string;
  due_at: string;
  attempt: number;
  last_outcome_title: string;
  customer_value: number;
  is_priority: boolean;
  status: string;
  source: string;
};
export type TaskCounts = {
  open: number;
  overdue: number;
  today: number;
  future: number;
  done: number;
  stats: { today_calls: number; today_target: number; month_calls: number; month_connected: number; month_sales: number };
  programs: { id: number; name: string }[];
  results: string[];
};
export type CallLogRow = {
  id: number;
  created_at: string;
  agent: string;
  program: string;
  outcome_title: string;
  connected: boolean;
  answers: Record<string, AnswerEntry>;
  note: string;
  form_version: number;
  editable: boolean;
};
export type TaskDetail = {
  id: number;
  status: string;
  attempt: number;
  due_at: string;
  is_priority: boolean;
  note_min_chars: number;
  program: { id: number; name: string };
  customer: { source_id: number; name: string; mobile: string; tier: string | null; last_order_at: string | null; order_count: number; value: number };
  form: { version: number; schema: FormSchema } | null;
  history: CallLogRow[];
};
export type CallTag = { id: number; title: string; color: string; needs_action: boolean; open_until_purchase: boolean; is_active: boolean };
export type CustomerCalls = {
  status: {
    do_not_call: boolean;
    next_call_allowed_at: string | null;
    last_outcome_title: string;
    last_call_at: string | null;
    dnc_cleared_at: string | null;
    dnc_cleared_by: string | null;
    dnc_clear_reason: string;
  } | null;
  stats: { total: number; connected: number; purchase_amount: number; next_followup_at: string | null };
  results: CallCard[];
  total: number;
  page: number;
  per_page: number;
};
export type CallCard = CallLogRow & {
  tags: { title: string; color: string }[];
  purchase: { amount: number; days_after: number } | null;
  attempt: { n: number; of: number } | null;
  followup_at: string | null;
};
export type CallListRow = {
  id: number;
  name: string;
  kind: "fixed" | "dynamic";
  source: "filters" | "manual" | "excel";
  filter_params: Record<string, unknown>;
  customer_count: number;
  job_status: string;
  created_at: string;
};
export type ProgramRow = {
  id: number;
  name: string;
  status: "draft" | "active" | "paused" | "ended";
  share_mode: "equal" | "custom";
  list: CallListRow | null;
  agents: { user_id: number; username: string; share_percent: number }[];
  published_version: number | null;
  form_summary: { outcomes: number; fields: number } | null;
  job: { status: string; done: number; total: number };
};
export type ProgramPreview = { total: number; internal: number; do_not_call: number; recent: number; open_task: number; eligible: number; excluded: number };
export type ProgramForm = {
  draft: { id: number; version: number; status: string; schema: FormSchema } | null;
  published: { id: number; version: number; status: string; schema: FormSchema } | null;
  used_outcome_ids: string[];
  used_option_ids: string[];
};
export type CallSettings = { buy_window_days: number; default_gap_days: number; note_min_chars: number };
