import { useCallback, useState } from "react";
import { useApi } from "../hooks/useApi";
import { pulseService } from "../services/pulse";
import { fa } from "../features/pulse/format";
import { HomeTab } from "../features/pulse/HomeTab";
import { HoursTab } from "../features/pulse/HoursTab";
import { PostsTab } from "../features/pulse/PostsTab";
import { ProductsTab } from "../features/pulse/ProductsTab";
import { PostSheetBody, ProductSheetBody } from "../features/pulse/Sheets";
import type { PulseStatus } from "../features/pulse/types";
import { Sheet } from "../features/pulse/ui";

type Tab = "home" | "posts" | "products" | "hours" | "chat";

const TABS: { key: Tab; label: string; ai?: boolean }[] = [
  { key: "home", label: "صبح‌بخیر" },
  { key: "posts", label: "پست‌ها" },
  { key: "products", label: "محصولات" },
  { key: "hours", label: "ساعت طلایی" },
  { key: "chat", label: "دستیار", ai: true }, // hidden until PULSE_AI_ENABLED; not built in Phase 2
];

type SheetState = { type: "post"; id: number } | { type: "product"; code: string } | null;

function StatusLine({ status }: { status: PulseStatus }) {
  const hours = status.hours_since_sync;
  const age = hours == null ? "هنوز همگام نشده" : hours < 1 ? "کمتر از یک ساعت پیش" : `${fa(Math.floor(hours))} ساعت پیش`;
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
      <span className={`h-[7px] w-[7px] rounded-full ${status.last_error ? "bg-[var(--danger)]" : status.stale ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`} />
      <span>
        @{status.handle} · آخرین به‌روزرسانی: {age}
      </span>
    </div>
  );
}

function Banner({ status }: { status: PulseStatus }) {
  if (status.last_error) {
    return <div className="mb-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--delta-down-bg)] px-3 py-2 text-xs text-[var(--danger)]">اتصال Zernio قطع است. آخرین تلاش برای همگام‌سازی ناموفق بود.</div>;
  }
  if (status.stale && status.hours_since_sync != null) {
    return (
      <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-[var(--warning)]">
        آخرین به‌روزرسانی: {fa(Math.floor(status.hours_since_sync))} ساعت پیش. عددها ممکن است قدیمی باشند.
      </div>
    );
  }
  return null;
}

export function PulsePage() {
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [productFilter, setProductFilter] = useState<string | undefined>();
  const { data: home, loading, error } = useApi(() => pulseService.home(), []);
  const close = useCallback(() => setSheet(null), []);
  const openPost = useCallback((id: number) => setSheet({ type: "post", id }), []);
  const openProduct = useCallback((code: string) => setSheet({ type: "product", code }), []);
  const status = home?.status;
  const tabs = TABS.filter((item) => !item.ai || status?.ai_enabled);

  return (
    <div className="mx-auto max-w-[560px] lg:max-w-4xl">
      <header className="flex items-center gap-3 pb-1.5 pt-1">
        <div className="grid h-10 w-10 place-items-center rounded-[13px] bg-gradient-to-br from-[var(--pulse-strong)] to-[#9a5b26] font-extrabold text-[#1a1108] shadow-[0_8px_24px_-8px_rgba(217,160,102,.6)]">
          P
        </div>
        <div>
          <h1 className="m-0 text-lg font-extrabold">پالس اینستاگرام</h1>
          {status ? <StatusLine status={status} /> : null}
        </div>
      </header>

      <nav role="tablist" aria-label="بخش‌های پالس" className="sticky top-[49px] z-30 -mx-1 flex gap-1.5 overflow-x-auto bg-canvas px-1 pb-2.5 pt-2 [scrollbar-width:none] lg:top-0">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => {
              setTab(item.key);
              setSheet(null);
              window.scrollTo({ top: 0 });
            }}
            className={`flex-none cursor-pointer rounded-xl border px-3.5 py-2 text-[13px] transition-colors ${
              tab === item.key ? "border-[var(--pulse)] bg-[var(--pulse)] font-bold text-[var(--pulse-ink)]" : "border-line bg-surface text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {status ? <Banner status={status} /> : null}

      {error ? <div className="py-10 text-center text-sm text-muted">پالس بارگذاری نشد.</div> : null}
      {loading && !home ? (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-[18px] bg-elevated" />
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[18px] bg-elevated" />
            ))}
          </div>
        </div>
      ) : null}
      {home && !home.status.has_data ? <div className="py-10 text-center text-sm text-muted">هنوز داده‌ای همگام‌سازی نشده.</div> : null}

      {home && home.status.has_data ? (
        <div key={tab} className="pulse-rise">
          {tab === "home" ? <HomeTab data={home} onOpenPost={openPost} /> : null}
          {tab === "posts" ? <PostsTab onOpenPost={openPost} code={productFilter} onClearCode={() => setProductFilter(undefined)} /> : null}
          {tab === "products" ? <ProductsTab onOpenProduct={openProduct} /> : null}
          {tab === "hours" ? <HoursTab /> : null}
        </div>
      ) : null}

      <Sheet open={sheet !== null} onClose={close} label={sheet?.type === "product" ? "جزئیات محصول" : "جزئیات پست"}>
        {sheet?.type === "post" ? <PostSheetBody key={sheet.id} id={sheet.id} onOpenProduct={openProduct} /> : null}
        {sheet?.type === "product" ? <ProductSheetBody key={sheet.code} productCode={sheet.code} onOpenPost={openPost} /> : null}
      </Sheet>
    </div>
  );
}
