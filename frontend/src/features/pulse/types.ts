export type Band = "great" | "good" | "mid" | "bad" | null;
export type PostKind = "reel" | "carousel" | "image";

export type PulseStatus = {
  last_sync_at: string | null;
  hours_since_sync: number | null;
  stale: boolean;
  last_error: string;
  covers: { ok: number; pending: number; failed: number; expired: number; skipped: number; relay_configured: boolean; last_relay_error: string };
  has_data: boolean;
  ai_enabled: boolean;
  handle: string;
};

export type PostCard = {
  id: number;
  url: string;
  caption: string;
  kind: PostKind;
  group: "reel" | "slide";
  published_at: string;
  local_date: string;
  hour: number;
  minute: number;
  weekday: number;
  views: number | null;
  reach: number | null;
  saves: number | null;
  shares: number | null;
  skip_rate: number | null;
  duration_s: number | null;
  score: number | null;
  band: Band;
  fresh: boolean;
  brand: boolean;
  codes: string[];
  thumb: string | null;
  primary?: boolean;
};

export type KpiCard = {
  key: "views" | "reach" | "er" | "skip";
  value: number | null;
  previous: number | null;
  change_pct: number | null;
  good: boolean | null;
  lower_better: boolean;
  spark: (number | null)[];
};

export type PulseTask = { id: number; title: string; reason: string; rule: string; done: boolean; done_by: string | null; done_at: string | null };

export type PulseHome = {
  date: string;
  brief: { text: string; created_at: string; source: string } | null;
  kpis: { cards: KpiCard[]; posts: number; from: string; to: string };
  tasks: PulseTask[];
  star: PostCard | null;
  yesterday: PostCard[];
  medians: { reel: number | null; slide: number | null };
  status: PulseStatus;
};

export type PostList = {
  results: PostCard[];
  total: number;
  page: number;
  per_page: number;
  counts: Record<"all" | "reel" | "slide" | "brand", number>;
  medians: { reel: number | null; slide: number | null };
};

export type PostProduct = {
  position: number;
  code: string;
  line: string;
  caption_price: number | null;
  share: number;
  weighted_views: number;
  matched: boolean;
  title: string | null;
  price: number | null;
  dupes: number | null;
  thumb: string | null;
};

export type PostDetail = PostCard & {
  likes: number | null;
  comments: number | null;
  follows: number | null;
  profile_views: number | null;
  er: number | null;
  avg_watch_ms: number | null;
  is_ad: boolean;
  metrics_updated_at: string | null;
  cover: string | null; // original cover; `thumb` is the 600 px list copy
  group_median: number | null;
  page_medians: { comments: number | null; shares: number | null; saves: number | null; skip: number | null };
  skip_target: number;
  growth: { day: number; date: string; views: number | null }[];
  growth_complete: boolean;
  tracking_since: string | null;
  autopsy: string;
  products: PostProduct[];
};

export type ProductRow = {
  code: string;
  title: string | null;
  price: number | null;
  thumb: string | null;
  dupes: number | null;
  posts: number;
  primary_posts: number;
  weighted_views: number;
  weighted_saves: number;
  best: { post_id: number; score: number } | null;
  line: string;
};

export type ProductList = { matched: ProductRow[]; unmatched: ProductRow[]; posts_with_codes: number };
export type ProductDetail = ProductRow & { matched: boolean; post_cards: PostCard[] };

export type HoursData = {
  group: "reel" | "all";
  cells: { weekday: number; hour: number; score: number; posts: number; band: Band; faded: boolean }[];
  weekdays: { weekday: number; label: string; score: number | null; posts: number }[];
  headline: {
    noon_median: number | null;
    night_median: number | null;
    noon_vs_night_pct: number | null;
    night_posts: number;
    posts: number;
    best_weekday: string | null;
    worst_weekday: string | null;
  };
};
