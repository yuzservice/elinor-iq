export type User = {
  id: number;
  username: string;
  role: string;
  can_manage_platform?: boolean;
};

export type WindowMeta = {
  start: string;
  end: string;
  from?: string;
  to?: string;
  label: string;
};

export type DataCoverage = {
  partial: boolean;
  message: string;
  pos_sync?: {
    by_line: {
      key: SalesLineKey;
      label: string;
      count: number;
      max_date: string | null;
      lag_days: number | null;
    }[];
    stale_lines: {
      key: SalesLineKey;
      label: string;
      count: number;
      max_date: string | null;
      lag_days: number | null;
    }[];
    needs_sync: boolean;
    historical_import_through: string;
  };
};

export type Paginated<T> = {
  page: number;
  per_page: number;
  total: number;
  results: T[];
  data_coverage?: DataCoverage;
  timing_ms?: number;
};

export type HomePeriod = "day" | "week" | "month" | "quarter";

export type HomeMetricCard = {
  key: string;
  label: string;
  kind: "money" | "units" | "snappay" | "digipay";
  total: number;
  change_pct: number | null;
  lines: { key: SalesLineKey; label: string; value: number }[];
};

export type HomeSummary = {
  window: WindowMeta;
  period: HomePeriod;
  metric_cards: HomeMetricCard[];
  revenue_definition: string;
  data_coverage: DataCoverage;
  metrics: {
    sales: number;
    orders: number;
    customers: number;
    items_sold: number;
  };
  trend: { date: string; value: number }[];
  recent_orders: {
    id: number;
    created_at: string;
    customer_id: number | null;
    customer_name: string;
    customer_name_is_fallback: boolean;
    status: string;
    status_label: string;
    total_amount: number;
  }[];
  line_board?: {
    key: SalesLineKey;
    label: string;
    purchase_count: number;
    customer_count: number;
    units_sold: number;
    avg_units_per_purchase: number;
    repeat_customers?: number;
    order_value?: number | null;
    previous?: {
      purchase_count: number;
      customer_count: number;
      repeat_customers: number;
      order_value: number;
    };
    change_pct?: {
      purchase_count: number | null;
      customer_count: number | null;
      repeat_customers: number | null;
      order_value: number | null;
    };
  }[];
  sales_lines: {
    key: string;
    label: string;
    connected: boolean;
    value: number | null;
    note: string;
    parts?: { key: string; label: string; value: number }[];
  }[];
  needs_attention: { available: boolean; message: string; items?: string[] };
};

export type SalesLineKey = "ONLINE" | "SARI" | "GORGAN" | "CAPRI";

export type SalesLineComparison = {
  key: SalesLineKey;
  label: string;
  purchase_count: number;
  customer_count: number;
  units_sold: number;
  avg_units_per_purchase: number;
  new_customers: number;
  repeat_customers: number;
  online_order_value?: number;
  previous_period: {
    purchase_count: number;
    customer_count: number;
    units_sold: number;
    avg_units_per_purchase: number;
    new_customers: number;
    repeat_customers: number;
  };
  change_pct: {
    purchase_count: number | null;
    units_sold: number | null;
  };
};

export type SalesTrendPoint = {
  date: string;
  date_label: string;
  purchase_count: number;
  units_sold: number;
  amount: number;
};

export type SalesInsight = {
  key: string;
  label: string;
  value: string;
  detail: string;
};

export type PhysicalReturnsBranch = {
  key: SalesLineKey;
  label: string;
  refund_count: number;
  exchange_count: number;
  refunded_item_units: number;
  replacement_item_units: number;
};

export type SizeColorRow = { label: string; units_sold: number };

export type SalesProductRow = {
  product: string;
  units_sold: number;
  purchase_count: number;
  customer_count: number;
  last_sale_at: string | null;
  online_units: number;
  sari_units: number;
  gorgan_units: number;
  capri_units: number;
};

export type SalesSummary = {
  window: WindowMeta;
  semantics_note: string;
  data_coverage: DataCoverage;
  filters: { sales_line: SalesLineKey | "all"; group: TrendGroup; section?: string };
  metrics?: {
    purchase_count: number;
    customer_count: number;
    units_sold: number;
    avg_units_per_purchase: number;
    new_customers: number;
    repeat_customers: number;
    online_order_value?: number;
  };
  returns_canceled?: {
    online_canceled: number;
    online_failed: number;
    online_wait_for_payment: number;
    pos_refunds: number;
    pos_cancelled: number;
  };
  physical_returns?: {
    branches: PhysicalReturnsBranch[];
    totals: {
      refund_count: number;
      exchange_count: number;
      refunded_item_units: number;
      replacement_item_units: number;
    };
  };
  sales_lines?: SalesLineComparison[];
  trend?: {
    group: TrendGroup;
    points: SalesTrendPoint[];
  };
  size_color?: {
    sizes: SizeColorRow[];
    colors: SizeColorRow[];
  };
  insights?: SalesInsight[];
  timing_ms?: number;
};

export type TrendGroup = "daily" | "weekly" | "monthly" | "weekday" | "hourly";

export type SalesOrder = {
  created_at: string;
  sales_line: SalesLineKey;
  sales_line_label: string;
  id: number;
  customer_id: number | null;
  customer_name: string;
  customer_name_is_fallback?: boolean;
  kind: "online" | "pos";
  status: string;
  status_label: string;
  item_count: number;
};

export type CustomerRow = {
  id: number;
  name: string;
  name_is_fallback: boolean;
  incomplete: boolean;
  incomplete_label: string | null;
  mobile: string;
  order_count: number;
  online_count: number;
  pos_count: number;
  first_purchase_at: string | null;
  last_purchase_at: string | null;
  status: string;
  status_label: string;
  is_purchasing: boolean;
  channel: "online" | "physical" | "both" | "none";
  channel_label: string;
  sales_lines: string[];
  sales_line_labels: string[];
  lifetime_purchase_amount: number;
  days_since_last_purchase: number | null;
  tier_code: string | null;
  tier_label: string | null;
};

export type CustomerReports = {
  window: WindowMeta;
  note: string;
  data_coverage: DataCoverage;
  populations: {
    all_customers: number;
    purchasing_customers: number;
    registered_without_orders: number;
  };
  groups: { key: string; label: string; count: number; explanation: string }[];
};

export type CustomerAddress = {
  province: string;
  city: string;
  address: string;
  postal_code: string;
  recipient_name: string;
  recipient_mobile: string;
};

export type CustomerPurchaseItem = {
  id: number;
  product: string;
  variant: string;
  quantity: number;
  color: string;
  size: string;
  amount: number;
  discount_amount: number;
  type: string;
  type_label: string;
};

export type CustomerPurchase = {
  key: string;
  kind: "online" | "pos";
  sales_line: string;
  sales_line_label: string;
  source_id: number;
  created_at: string;
  type: string;
  type_label: string;
  item_count: number;
  status: string;
  status_label: string;
  value: number | null;
  value_kind: "online_total" | null;
  value_label: string | null;
  discount_amount: number;
  is_cancelled: boolean;
  items: CustomerPurchaseItem[];
};

export type CustomerProductHistory = {
  product: string;
  total_quantity: number;
  purchase_count: number;
  last_purchase_at: string | null;
  colors: string[];
  sizes: string[];
};

export type Customer360 = {
  id: number;
  name: string;
  name_is_fallback: boolean;
  incomplete: boolean;
  mobile: string;
  email: string;
  status: string;
  status_label: string;
  first_purchase_at: string | null;
  last_purchase_at: string | null;
  purchase_count: number;
  online_count: number;
  pos_count: number;
  items_sold: number;
  sales_line_count: number;
  is_purchasing: boolean;
  purchase_behavior: "none" | "one_time" | "repeating";
  purchase_behavior_label: string;
  tier_code: string | null;
  tier_label: string | null;
  channel: "online" | "physical" | "both" | "none";
  channel_label: string;
  profile: {
    gender: string;
    gender_label: string;
    national_code: string;
    birth_date: string | null;
    card_number: string;
    club_level: string;
    summary: string;
    email: string;
    status: string;
    status_label: string;
    created_at: string | null;
    updated_at: string | null;
  };
  sales_lines: { key: string; label: string; purchase_count: number; used: boolean }[];
  purchases: Paginated<CustomerPurchase>;
  addresses: CustomerAddress[];
  discounts: {
    source_id: number;
    kind: "online" | "pos";
    sales_line: string;
    sales_line_label: string;
    created_at: string;
    discount_amount: number;
    status: string;
    status_label: string;
  }[];
};

export type ProductRow = {
  id: number;
  product: string;
  variant: string;
  sold_quantity: number;
  order_count: number;
  last_sale_at: string | null;
};

export type SystemStatus = {
  api: { configured: boolean; base_url?: string; username?: string; password_set?: boolean };
  sync: {
    running: boolean;
    last_status: string | null;
    last_started_at: string | null;
    last_finished_at: string | null;
    last_success_at: string | null;
    window_start: string | null;
    window_end: string | null;
    error: string;
    job: {
      kind: string;
      status: string;
      status_label: string;
      stalled: boolean;
      error: string;
      started_at: string | null;
      finished_at: string | null;
      window_start: string | null;
      window_end: string | null;
      requests_made: number;
      current_day: string | null;
      pos_sales_upserted: number;
      failures: number;
      branches: string[];
    } | null;
  };
  counts: {
    orders: number;
    customers: number;
    purchasing_customers: number;
    items: number;
    products: number;
    variants: number;
  };
  data_coverage: DataCoverage;
  backup: { available: boolean; note: string };
};

export type SmartDirectConnectionStatus = {
  key: string;
  label: string;
  state: string;
  state_label: string;
};

export type SmartDirectToday = {
  sessions_processed: number;
  product_requests: number;
  links_sent: number;
  admin_handoffs: number;
};

export type SmartDirectSessionSummary = {
  id: number;
  started_at: string;
  last_activity_at: string;
  closed_at: string | null;
  status: string;
  status_label: string;
  request_summary: string;
  detected_product_type: string;
  detected_color: string;
  detected_size: string;
  detected_budget_min: number | null;
  detected_budget_max: number | null;
  selected_product_source_id: number | null;
  selected_variant_source_id: number | null;
  selected_product_label: string;
  outcome: string;
  outcome_label: string;
};

export type SmartDirectSummary = {
  connections: SmartDirectConnectionStatus[];
  instagram: SmartDirectInstagramStatus;
  today: SmartDirectToday;
  recent_outcomes: SmartDirectSessionSummary[];
};

export type SmartDirectInstagramStatus = {
  configured: boolean;
  account_id: string;
  api_version: string;
  graph_host: string;
  scopes: string[];
  webhook: {
    url_path: string;
    verify_token_configured: boolean;
    signature_configured: boolean;
    ready: boolean;
    last_received_at: string | null;
    last_status: string;
    last_note: string;
    status_label: string;
  };
  last_send: {
    at: string | null;
    ok: boolean | null;
    error: string;
    session_id: number | null;
  };
};

export type SmartDirectDebugMessage = {
  role: string;
  text: string;
  at?: string;
};

export type SmartDirectDebugSession = {
  id: number;
  instagram_user_id: string;
  status: string;
  status_label: string;
  last_activity_at: string;
  expires_at: string;
  can_reply: boolean;
  recent_messages: SmartDirectDebugMessage[];
};

export type SmartDirectDebug = {
  label: string;
  instagram: SmartDirectInstagramStatus;
  debug_session: SmartDirectDebugSession | null;
};
