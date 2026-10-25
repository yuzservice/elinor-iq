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
  is_operator: boolean;
  operator_label: string | null;
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
  receiver: string;
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
  purchase_behavior: "none" | "one_time" | "repeating" | "operator";
  purchase_behavior_label: string;
  tier_code: string | null;
  tier_label: string | null;
  is_operator: boolean;
  operator_label: string | null;
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

export type ProductChannelUnits = {
  online: number;
  sari: number;
  gorgan: number;
  capri: number;
};

export type ProductRow = {
  id: number;
  product: string;
  variant: string;
  category?: string;
  sku?: string;
  sold_quantity: number;
  order_count: number;
  revenue?: number;
  channels?: ProductChannelUnits;
  last_sale_at: string | null;
  status?: "hero" | "stable" | "slow" | "dead" | "fast_mover";
  status_label?: string;
  action_recommendation?: string;
  complementary_items?: string[];
  initial_quantity?: number;
  sell_through_pct?: number;
  days_to_sell_out?: number;
  velocity_score?: number;
  restock_date?: string | null;
};

export type ProductKpis = {
  gross_revenue: number;
  units_sold: number;
  hero_product: {
    title: string;
    revenue: number;
    units: number;
    share_pct: number;
  } | null;
  slow_movers_count: number;
  capital_at_risk: number;
  cross_sell_index: number;
  active_products_count: number;
  fast_movers_count?: number;
  avg_days_to_sell_out?: number;
  top_velocity_product?: {
    title: string;
    velocity_score: number;
    days_to_sell_out: number;
    sell_through_pct: number;
    sold_quantity: number;
  } | null;
};

export type ProductBundle = {
  item_a: string;
  item_b: string;
  co_occurrence_count: number;
  confidence_pct: number;
  recommendation: string;
  target_audience: string;
};

export type ProductSizeColor = {
  sizes: { label: string; units_sold: number; share_pct: number }[];
  colors: { label: string; units_sold: number; share_pct: number }[];
};

export type Product360Data = {
  id: number;
  title: string;
  sku: string;
  category: string;
  total_units: number;
  total_revenue: number;
  channels: {
    online: { units: number; pct: number };
    sari: { units: number; pct: number };
    gorgan: { units: number; pct: number };
    capri: { units: number; pct: number };
  };
  variants: {
    id: number;
    title: string;
    size: string;
    color: string;
    units_sold: number;
    price: number;
  }[];
  complementary_products: { product: string; times_together: number }[];
  action_recommendation: string;
};

export type ProductsListResponse = Paginated<ProductRow> & {
  kpis?: ProductKpis;
  window?: WindowMeta | null;
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
      kind_label: string;
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
      days_skipped: number | null;
      days_fetched: number | null;
    } | null;
    week: {
      from: string;
      to: string;
      days: {
        date: string;
        open: boolean;
        branches: {
          key: string;
          label: string;
          sales: number;
          api_count: number | null;
          state: string;
          state_label: string;
          synced_at: string | null;
        }[];
      }[];
    };
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

export type TierCode = string;

export type TierOperator = "gte" | "lte";

export type TierConditionKey = "purchase_count" | "days_since_last_min" | "days_since_last" | "lifetime_amount";

export type TierCondition = { enabled: boolean; value: number | null; operator?: TierOperator };

export type TierRule = {
  code: TierCode | null;
  title: string;
  enabled: boolean;
  conditions: Record<TierConditionKey, TierCondition>;
};

export type TierRules = { tiers: TierRule[] };

export type PublicTier = { code: TierCode; title: string; priority: number; summary: string };

export type TierRuleSetPayload = {
  version: number;
  status: "draft" | "active" | "archived";
  rules: TierRules;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  previewed_at: string | null;
  preview_current: boolean;
  activated_by: string | null;
  activated_at: string | null;
  activation_status: "" | "running" | "succeeded" | "failed";
  activation_error: string;
};

export type TierRulesState = {
  active: TierRuleSetPayload | null;
  draft: TierRuleSetPayload | null;
  versions: {
    version: number;
    status: "active" | "archived";
    activated_at: string | null;
    activated_by: string | null;
    note: string;
  }[];
  activation: { running: boolean; status: "" | "running" | "succeeded" | "failed"; error: string };
  conditions: { key: TierConditionKey; label: string; operators: TierOperator[]; fixed_operator: TierOperator | null }[];
  max_tiers: number;
};

export type TierRulesPreview = {
  version: number;
  tiers: {
    tier_code: TierCode | null;
    label: string | null;
    enabled: boolean;
    in_draft: boolean;
    current: number;
    draft: number;
    delta: number;
  }[];
  transitions: { from: TierCode | null; to: TierCode | null; count: number }[];
  samples: {
    source_id: number;
    full_name: string;
    mobile: string;
    purchase_count: number;
    days_since_last_purchase: number | null;
    lifetime_purchase_amount: number;
    from: TierCode | null;
    to: TierCode | null;
  }[];
  moved: number;
  warnings: {
    kind: "unmatched" | "held" | "campaign" | "empty";
    tier_code: TierCode | null;
    label: string | null;
    count: number | null;
    message: string;
  }[];
};
