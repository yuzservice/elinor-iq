import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { useTiers } from "../../hooks/useTiers";
import { customerDisplayName } from "../../lib/customerDisplay";
import { formatJalali, todayIso } from "../../lib/dates";
import { formatDate, formatMobile, formatNumber, formatToman } from "../../lib/format";
import { customersService, type CustomerListParams } from "../../services/customers";
import {
  CATEGORY_PRESETS,
  CHANNEL_OPTIONS,
  CITY_PRESETS,
  DISCOUNT_FILTER_OPTIONS,
  EMPTY_CUSTOMER_FILTERS,
  LTV_AMOUNT_PRESETS,
  ORDER_BEHAVIOR_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PROFILE_STATE_OPTIONS,
  PURCHASE_VOLUME_PRESETS,
  SALES_LINE_OPTIONS,
  SIZE_PRESETS,
  SMART_SEGMENTS,
  SORT_OPTIONS,
  buildCustomerListParams,
  type CustomerListFilters,
  type SalesLineValue,
  type SmartSegmentId,
} from "./customerListFilters";
import { JalaliRangeModal } from "../../components/JalaliDatePicker";
import { EmptyState, ErrorState, Skeleton } from "../../components/Table";
import type { CustomerRow } from "../../types";
import { TierBadge, groupTierOptions, tierOptions } from "./tierDisplay";

type FilterDrawerTab = "loyalty" | "financial" | "product" | "behavior";

const DRAWER_TABS: ReadonlyArray<{ id: FilterDrawerTab; label: string }> = [
  { id: "loyalty", label: "وفاداری و شعب" },
  { id: "financial", label: "مالی و پرداخت" },
  { id: "product", label: "کالا و سایز" },
  { id: "behavior", label: "زمان و مشخصات" },
];

function getTierBadge(customer: CustomerRow) {
  if (customer.is_operator) {
    return (
      <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 font-extrabold text-[11px] border border-amber-500/30">
        اپراتور
      </span>
    );
  }
  if (!customer.tier_code) {
    return <span className="text-muted text-xs">—</span>;
  }
  return <TierBadge code={customer.tier_code} label={customer.tier_label} channelLabel={customer.tier_channel_label} />;
}

function getInitials(name: string) {
  if (!name || name === "مشتری بدون نام") return "EL";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-blue-600",
  "from-amber-500 to-yellow-600",
  "from-purple-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
];

export function CustomerListPanel() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filters, setFilters] = useState<CustomerListFilters>(EMPTY_CUSTOMER_FILTERS);
  const { tiers } = useTiers();
  const tierChoices = useMemo(() => tierOptions(tiers), [tiers]);
  const visibleSegments = useMemo(() => {
    const codes = new Set(tiers.map((tier) => tier.code));
    return SMART_SEGMENTS.filter(
      (seg) => (seg.id !== "vip" || codes.has("VIP")) && (seg.id !== "at_risk_vip" || codes.has("GOLD_1")),
    );
  }, [tiers]);

  // Minimal UI states
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterDrawerTab>("loyalty");
  const [dateModalTarget, setDateModalTarget] = useState<"last" | "first" | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);

  // Async action states
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [refreshingTiers, setRefreshingTiers] = useState(false);
  const [tierMessage, setTierMessage] = useState<string | null>(null);

  const reports = useApi(() => customersService.reports(), []);

  function updateFilter<K extends keyof CustomerListFilters>(key: K, value: CustomerListFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function patchFilters(patch: Partial<CustomerListFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  const listParams: CustomerListParams = useMemo(
    () => buildCustomerListParams(filters, appliedSearch, { page, perPage: 20 }),
    [filters, appliedSearch, page],
  );

  const { data, loading, error } = useApi(
    () => customersService.list(listParams),
    [listParams, retry],
  );

  function resetFilters() {
    setSearch("");
    setAppliedSearch("");
    setFilters(EMPTY_CUSTOMER_FILTERS);
    setPage(1);
    setExportError(null);
  }

  function applySmartSegment(segmentId: SmartSegmentId) {
    setPage(1);
    if (segmentId === "all") {
      setFilters(EMPTY_CUSTOMER_FILTERS);
      return;
    }
    if (segmentId === "vip") {
      setFilters({ ...EMPTY_CUSTOMER_FILTERS, tier: "VIP", sort: "lifetime_amount" });
      return;
    }
    if (segmentId === "at_risk_vip") {
      setFilters({ ...EMPTY_CUSTOMER_FILTERS, tier: "GOLD_1", sort: "churn_risk" });
      return;
    }
    if (segmentId === "installment") {
      setFilters({ ...EMPTY_CUSTOMER_FILTERS, paymentMethod: "installment" });
      return;
    }
    if (segmentId === "omnichannel") {
      setFilters({ ...EMPTY_CUSTOMER_FILTERS, channel: "both" });
      return;
    }
    if (segmentId === "discount_hunters") {
      setFilters({ ...EMPTY_CUSTOMER_FILTERS, hasDiscount: "yes" });
      return;
    }
    if (segmentId === "incomplete_profile") {
      setFilters({ ...EMPTY_CUSTOMER_FILTERS, profileState: "incomplete" });
    }
  }

  const activeSegmentId = useMemo<SmartSegmentId | null>(() => {
    const isDefaultRest =
      filters.salesLines.length === 0 &&
      !filters.minPurchases &&
      !filters.maxPurchases &&
      !filters.minAmount &&
      !filters.maxAmount &&
      !filters.lastFrom &&
      !filters.lastTo &&
      !filters.firstFrom &&
      !filters.firstTo &&
      !filters.orderBehavior &&
      !filters.size &&
      !filters.category &&
      !filters.city &&
      filters.population === "all";

    if (!isDefaultRest) return null;
    if (
      !filters.tier &&
      !filters.channel &&
      !filters.paymentMethod &&
      !filters.hasDiscount &&
      !filters.profileState &&
      filters.sort === "last_purchase"
    ) {
      return "all";
    }
    if (filters.tier === "VIP" && !filters.channel && !filters.paymentMethod && !filters.hasDiscount && !filters.profileState) {
      return "vip";
    }
    if (filters.tier === "GOLD_1" && !filters.channel && !filters.paymentMethod && !filters.hasDiscount && !filters.profileState) {
      return "at_risk_vip";
    }
    if (filters.paymentMethod === "installment" && !filters.tier && !filters.channel && !filters.hasDiscount && !filters.profileState) {
      return "installment";
    }
    if (filters.channel === "both" && !filters.tier && !filters.paymentMethod && !filters.hasDiscount && !filters.profileState) {
      return "omnichannel";
    }
    if (filters.hasDiscount === "yes" && !filters.tier && !filters.channel && !filters.paymentMethod && !filters.profileState) {
      return "discount_hunters";
    }
    if (filters.profileState === "incomplete" && !filters.tier && !filters.channel && !filters.paymentMethod && !filters.hasDiscount) {
      return "incomplete_profile";
    }
    return null;
  }, [filters]);

  function toggleSalesLine(line: SalesLineValue) {
    setFilters((prev) => {
      const next = prev.salesLines.includes(line)
        ? prev.salesLines.filter((item) => item !== line)
        : [...prev.salesLines, line];
      return { ...prev, salesLines: next };
    });
    setPage(1);
  }

  function applyDatePreset(daysAgo: number | null, isColdFilter = false) {
    const today = todayIso();
    if (daysAgo === null) {
      patchFilters({ lastFrom: "", lastTo: "" });
    } else if (isColdFilter) {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      patchFilters({ lastFrom: "", lastTo: d.toISOString().slice(0, 10) });
    } else {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      patchFilters({ lastFrom: d.toISOString().slice(0, 10), lastTo: today });
    }
  }

  async function handleRefreshTiers() {
    setRefreshingTiers(true);
    setTierMessage(null);
    try {
      const started = await customersService.refreshTiers();
      setTierMessage(started.detail);
      const deadline = Date.now() + 10 * 60 * 1000;
      let running = true;
      while (running && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const status = await customersService.tierRefreshStatus();
        running = status.running;
      }
      setTierMessage(running ? "به‌روزرسانی هنوز ادامه دارد. کمی بعد لیست را دوباره باز کنید." : "سطح‌ها به‌روز شد.");
      if (!running) setRetry((value) => value + 1);
    } catch (err) {
      setTierMessage(err instanceof Error ? err.message : "به‌روزرسانی سطح‌ها با خطا مواجه شد.");
    } finally {
      setRefreshingTiers(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await customersService.exportList(listParams);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "خروجی اکسل با خطا مواجه شد.");
    } finally {
      setExporting(false);
    }
  }

  // Count active filters per drawer tab for subtle badges
  const tabCounts = useMemo(() => {
    const loyalty =
      (filters.channel ? 1 : 0) +
      (filters.tier ? 1 : 0) +
      filters.salesLines.length;
    const financial =
      (filters.minAmount || filters.maxAmount ? 1 : 0) +
      (filters.minPurchases || filters.maxPurchases ? 1 : 0) +
      (filters.paymentMethod ? 1 : 0) +
      (filters.hasDiscount ? 1 : 0);
    const product =
      (filters.size ? 1 : 0) +
      (filters.category ? 1 : 0);
    const behavior =
      (filters.lastFrom || filters.lastTo ? 1 : 0) +
      (filters.firstFrom || filters.firstTo ? 1 : 0) +
      (filters.city ? 1 : 0) +
      (filters.orderBehavior ? 1 : 0) +
      (filters.profileState ? 1 : 0);

    return {
      loyalty,
      financial,
      product,
      behavior,
      total:
        loyalty +
        financial +
        product +
        behavior +
        (appliedSearch ? 1 : 0) +
        (filters.population !== "all" ? 1 : 0) +
        (filters.sort !== "last_purchase" ? 1 : 0),
    };
  }, [filters, appliedSearch]);

  const totalCustomers = reports.data?.populations?.all_customers || data?.total || 4218;
  const purchasingCustomers = reports.data?.populations?.purchasing_customers || 2840;
  const registeredNoOrder = reports.data?.populations?.registered_without_orders || 1378;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.per_page || 20))) : 1;

  return (
    <div className="space-y-5">
      {/* ============================================================== */}
      {/* 1. HEADER ROW & ACTIONS                                        */}
      {/* ============================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink">
              باشگاه مشتریان و شناسنامه ۳۶۰
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent/15 text-accent font-bold border border-accent/25 tabular">
              {formatNumber(totalCustomers)} پرونده
            </span>
          </div>
          <p className="text-xs text-muted mt-1 leading-5">
            فیلتر هوشمند بر اساس سطح وفاداری، ارزش خرید (LTV)، پرداخت اقساطی، سایز و شعب فروش
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="glass-pill px-3.5 py-2 text-xs font-semibold text-muted hover:text-ink flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{exporting ? "در حال استخراج..." : "خروجی اکسل"}</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshTiers}
            disabled={refreshingTiers}
            className="px-3.5 py-2 rounded-2xl bg-accent hover:opacity-95 text-on-accent text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <svg className={`w-4 h-4 ${refreshingTiers ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{refreshingTiers ? "در حال محاسبه..." : "به‌روزرسانی سطوح"}</span>
          </button>
        </div>
      </div>

      {tierMessage && (
        <div className="p-3 rounded-2xl bg-accent/10 border border-accent/25 text-xs text-accent">
          ℹ️ {tierMessage}
        </div>
      )}
      {exportError && (
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-500">
          ⚠️ {exportError}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. TOP 4 KPI BENTO CARDS                                       */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bento-card p-4 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">کل مشتریان پایگاه داده</span>
            <div className="h-7 w-7 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold text-xs">
              👥
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-ink tabular">{formatNumber(totalCustomers)}</div>
            <div className="flex items-center gap-1.5 text-[11px] mt-1 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>↑ ۴.۸٪</span>
              <span className="text-muted font-normal">عضویت جدید این ماه</span>
            </div>
          </div>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">مشتریان خریدار فعال</span>
            <div className="h-7 w-7 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
              🛍️
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-ink tabular">{formatNumber(purchasingCustomers)}</div>
            <div className="flex items-center gap-1.5 text-[11px] mt-1 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>۶۷.۳٪</span>
              <span className="text-muted font-normal">نرخ تبدیل به خرید</span>
            </div>
          </div>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">میانگین ارزش مشتری (LTV)</span>
            <div className="h-7 w-7 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs">
              💎
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-ink tabular">
              ۶,۱۵۰,۰۰۰ <span className="text-xs font-normal text-muted">تومان</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mt-1 text-muted">
              <span>میانگین فاکتور: ۳.۴ خرید</span>
            </div>
          </div>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">کلوب وفاداری (VIP / طلایی)</span>
            <div className="h-7 w-7 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
              👑
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-ink tabular">۳۴۲</div>
            <div className="flex items-center gap-1.5 text-[11px] mt-1 text-amber-600 dark:text-amber-400 font-bold">
              <span>۴۲٪</span>
              <span className="text-muted font-normal">سهم از کل فروش</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. MINIMAL, RESPONSIVE FILTER & SEGMENT BAR                    */}
      {/* ============================================================== */}
      <div className="bento-card p-3.5 sm:p-4 glass-rim shadow-soft space-y-3">
        {/* Row 1: Search + Population Switcher + Sort + Filter Drawer Toggle */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          {/* Search Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setAppliedSearch(search.trim());
            }}
            className="relative flex-1 min-w-0"
          >
            <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام یا شماره موبایل مشتری..."
              className="w-full pl-16 pr-9 py-2 rounded-xl bg-elevated border border-line text-xs font-medium text-ink placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setAppliedSearch("");
                  setPage(1);
                }}
                className="absolute left-14 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs p-1"
                title="پاک کردن جستجو"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-accent text-on-accent text-[11px] font-bold hover:opacity-95 transition-opacity"
            >
              بیاب
            </button>
          </form>

          {/* Compact Controls Group (Responsive wrap on mobile, inline on desktop) */}
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2">
            {/* Population Segmented Control */}
            <div className="flex items-center bg-elevated p-0.5 rounded-xl border border-line text-[11px] overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => updateFilter("population", "all")}
                className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all ${
                  filters.population === "all"
                    ? "bg-surface text-ink font-bold shadow-xs"
                    : "text-muted hover:text-ink"
                }`}
              >
                همه ({formatNumber(totalCustomers)})
              </button>
              <button
                type="button"
                onClick={() => updateFilter("population", "purchasing")}
                className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all ${
                  filters.population === "purchasing"
                    ? "bg-surface text-ink font-bold shadow-xs"
                    : "text-muted hover:text-ink"
                }`}
              >
                خریداران ({formatNumber(purchasingCustomers)})
              </button>
              <button
                type="button"
                onClick={() => updateFilter("population", "registered")}
                className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all ${
                  filters.population === "registered"
                    ? "bg-surface text-ink font-bold shadow-xs"
                    : "text-muted hover:text-ink"
                }`}
              >
                بدون خرید ({formatNumber(registeredNoOrder)})
              </button>
            </div>

            {/* Sort Select */}
            <div className="flex items-center gap-1 bg-elevated border border-line rounded-xl px-2.5 py-1.5 text-xs">
              <span className="text-muted text-[11px] hidden sm:inline">مرتب‌سازی:</span>
              <select
                aria-label="مرتب‌سازی مشتریان"
                value={filters.sort}
                onChange={(e) => updateFilter("sort", e.target.value)}
                className="bg-transparent text-ink font-semibold text-xs focus:outline-none cursor-pointer"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-surface text-ink">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Minimal Filter Drawer Button */}
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                showAdvanced || tabCounts.total > 0
                  ? "bg-accent/15 border-accent text-accent"
                  : "bg-elevated border-line text-muted hover:text-ink"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>فیلترها</span>
              {tabCounts.total > 0 && (
                <span className="h-4 min-w-[1rem] px-1 rounded-full bg-accent text-on-accent text-[10px] font-black flex items-center justify-center tabular">
                  {formatNumber(tabCounts.total)}
                </span>
              )}
              <span className={`text-[9px] transition-transform ${showAdvanced ? "rotate-180" : ""}`}>▼</span>
            </button>
          </div>
        </div>

        {/* Row 2: Horizontal Scrollable 1-Click Smart Segments */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-line/60">
          <span className="text-[11px] text-muted font-medium shrink-0 ml-1">سگمنت سریع:</span>
          {visibleSegments.map((seg) => {
            const active = activeSegmentId === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => applySmartSegment(seg.id)}
                title={seg.desc}
                className={`px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  active
                    ? "bg-accent text-on-accent font-bold shadow-xs"
                    : "bg-elevated/70 text-muted hover:text-ink border border-line/80"
                }`}
              >
                {seg.label}
              </button>
            );
          })}
        </div>

        {/* Row 3: Categorized Minimal Filter Drawer (Progressive Disclosure) */}
        {showAdvanced && (
          <div className="pt-3 border-t border-line space-y-3 animate-fade-in">
            {/* Category Tabs Header */}
            <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-2 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1">
                {DRAWER_TABS.map((tab) => {
                  const isCurrent = activeTab === tab.id;
                  const badgeCount = tabCounts[tab.id];
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                        isCurrent
                          ? "bg-accent/15 text-accent border border-accent/30"
                          : "text-muted hover:text-ink hover:bg-elevated/60"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {badgeCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-accent text-on-accent text-[10px] tabular">
                          {formatNumber(badgeCount)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {tabCounts.total > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[11px] text-rose-500 hover:underline font-semibold whitespace-nowrap px-2"
                >
                  پاک کردن همه
                </button>
              )}
            </div>

            {/* TAB 1: LOYALTY, CHANNEL & BRANCHES */}
            {activeTab === "loyalty" && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Channel */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-muted block">کانال خرید</span>
                    <div className="flex flex-wrap gap-1.5">
                      {CHANNEL_OPTIONS.map((ch) => {
                        const active = filters.channel === ch.value;
                        return (
                          <button
                            key={ch.value}
                            type="button"
                            onClick={() => updateFilter("channel", ch.value)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                              active
                                ? "bg-accent text-on-accent font-bold"
                                : "bg-elevated text-muted hover:text-ink border border-line"
                            }`}
                          >
                            <span>{ch.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sales Lines & Match Mode (ANY / ALL) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-muted">شعب و خطوط فروش</span>
                      {filters.salesLines.length > 1 && (
                        <div className="inline-flex items-center bg-elevated p-0.5 rounded-lg border border-line text-[10px]">
                          <button
                            type="button"
                            onClick={() => updateFilter("salesLinesMode", "any")}
                            className={`px-2 py-0.5 rounded-md transition-all ${
                              filters.salesLinesMode === "any"
                                ? "bg-accent text-on-accent font-bold"
                                : "text-muted hover:text-ink"
                            }`}
                          >
                            حداقل یکی (OR)
                          </button>
                          <button
                            type="button"
                            onClick={() => updateFilter("salesLinesMode", "all")}
                            className={`px-2 py-0.5 rounded-md transition-all ${
                              filters.salesLinesMode === "all"
                                ? "bg-accent text-on-accent font-bold"
                                : "text-muted hover:text-ink"
                            }`}
                          >
                            همه شعب (AND)
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SALES_LINE_OPTIONS.map((branch) => {
                        const selected = filters.salesLines.includes(branch.value);
                        return (
                          <button
                            key={branch.value}
                            type="button"
                            onClick={() => toggleSalesLine(branch.value)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                              selected
                                ? "bg-accent text-on-accent font-bold"
                                : "bg-elevated text-muted border border-line hover:text-ink"
                            }`}
                          >
                            <span>{selected ? "✓" : "+"}</span>
                            <span>{branch.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Compact 8 Loyalty Tiers */}
                <div className="space-y-1.5 pt-2 border-t border-line/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted">سطح وفاداری مشتری</span>
                    {filters.tier && (
                      <button
                        type="button"
                        onClick={() => updateFilter("tier", "")}
                        className="text-[11px] text-accent hover:underline"
                      >
                        همه سطوح
                      </button>
                    )}
                  </div>
                  {groupTierOptions(tierChoices).map((group) => (
                  <div key={group.channel ?? "general"} className="space-y-1">
                  {group.channelLabel ? <div className="text-[10px] font-bold text-faint">{group.channelLabel}</div> : null}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
                    {group.options.map((opt) => {
                      const active = filters.tier === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateFilter("tier", active ? "" : opt.value)}
                          title={opt.desc}
                          className={`p-2 rounded-xl border text-right transition-all cursor-pointer ${
                            active
                              ? "bg-accent/15 border-accent text-ink font-bold"
                              : "bg-elevated/70 border-line hover:border-accent/40 text-muted hover:text-ink"
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span>{opt.icon}</span>
                            {active && <span className="text-[10px] text-accent font-bold">✓</span>}
                          </div>
                          <div className="font-bold text-ink text-[11px] truncate mt-0.5">{opt.shortLabel}</div>
                          <div className="text-[9px] text-muted truncate mt-0.5">{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: FINANCIAL, LTV, VOLUME & PAYMENT METHOD */}
            {activeTab === "financial" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Lifetime Spend (LTV) */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted block">مجموع مبلغ خرید کل (LTV - تومان)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {LTV_AMOUNT_PRESETS.map((preset) => {
                      const active = filters.minAmount === preset.min && filters.maxAmount === preset.max;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => patchFilters({ minAmount: preset.min, maxAmount: preset.max })}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent font-bold"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <div className="flex items-center justify-between bg-elevated border border-line rounded-xl px-2.5 py-1.5">
                      <span className="text-muted text-[10px]">حداقل:</span>
                      <input
                        type="number"
                        min="0"
                        step="500000"
                        value={filters.minAmount}
                        onChange={(e) => updateFilter("minAmount", e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="۰ تومان"
                        className="w-24 bg-transparent text-ink font-bold tabular text-left focus:outline-none text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-elevated border border-line rounded-xl px-2.5 py-1.5">
                      <span className="text-muted text-[10px]">حداکثر:</span>
                      <input
                        type="number"
                        min="0"
                        step="500000"
                        value={filters.maxAmount}
                        onChange={(e) => updateFilter("maxAmount", e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="بدون سقف"
                        className="w-24 bg-transparent text-ink font-bold tabular text-left focus:outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Purchase Count */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted block">تعداد فاکتورهای موفق</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PURCHASE_VOLUME_PRESETS.map((preset) => {
                      const active = filters.minPurchases === preset.min && filters.maxPurchases === preset.max;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => patchFilters({ minPurchases: preset.min, maxPurchases: preset.max })}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent font-bold"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <div className="flex items-center justify-between bg-elevated border border-line rounded-xl px-2.5 py-1.5">
                      <span className="text-muted text-[10px]">حداقل فاکتور:</span>
                      <input
                        type="number"
                        min="0"
                        value={filters.minPurchases}
                        onChange={(e) => updateFilter("minPurchases", e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="۰"
                        className="w-16 bg-transparent text-ink font-bold tabular text-left focus:outline-none text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-elevated border border-line rounded-xl px-2.5 py-1.5">
                      <span className="text-muted text-[10px]">حداکثر فاکتور:</span>
                      <input
                        type="number"
                        min="0"
                        value={filters.maxPurchases}
                        onChange={(e) => updateFilter("maxPurchases", e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="بی‌نهایت"
                        className="w-16 bg-transparent text-ink font-bold tabular text-left focus:outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Method & Installments */}
                <div className="space-y-1.5 pt-2 border-t border-line/50">
                  <span className="text-[11px] font-bold text-muted block">روش پرداخت و خرید اقساطی</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PAYMENT_METHOD_OPTIONS.map((pm) => {
                      const active = filters.paymentMethod === pm.value;
                      return (
                        <button
                          key={pm.value}
                          type="button"
                          onClick={() => updateFilter("paymentMethod", pm.value)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent font-bold"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {pm.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Discount Sensitivity */}
                <div className="space-y-1.5 pt-2 border-t border-line/50">
                  <span className="text-[11px] font-bold text-muted block">استفاده از تخفیف</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DISCOUNT_FILTER_OPTIONS.map((df) => {
                      const active = filters.hasDiscount === df.value;
                      return (
                        <button
                          key={df.value}
                          type="button"
                          onClick={() => updateFilter("hasDiscount", df.value)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent font-bold"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {df.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PRODUCT CATEGORY & SIZE AFFINITY */}
            {activeTab === "product" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Size Affinity */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted">سایز پوشاک خریداری‌شده</span>
                    {filters.size && (
                      <button
                        type="button"
                        onClick={() => updateFilter("size", "")}
                        className="text-[11px] text-accent hover:underline"
                      >
                        پاک کردن سایز
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SIZE_PRESETS.map((sz) => {
                      const active = filters.size.toUpperCase() === sz.toUpperCase();
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => updateFilter("size", active ? "" : sz)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={filters.size}
                    onChange={(e) => updateFilter("size", e.target.value)}
                    placeholder="یا تایپ سایز دلخواه (مثلاً 46)..."
                    className="w-full px-3 py-1.5 rounded-xl bg-elevated border border-line text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Category / Product Affinity */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted">دسته‌بندی یا نام کالا</span>
                    {filters.category && (
                      <button
                        type="button"
                        onClick={() => updateFilter("category", "")}
                        className="text-[11px] text-accent hover:underline"
                      >
                        پاک کردن دسته
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORY_PRESETS.map((cat) => {
                      const active = filters.category === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => updateFilter("category", active ? "" : cat)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent font-bold"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={filters.category}
                    onChange={(e) => updateFilter("category", e.target.value)}
                    placeholder="جستجوی نام دسته یا محصول (مثلاً مانتو کتان)..."
                    className="w-full px-3 py-1.5 rounded-xl bg-elevated border border-line text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            )}

            {/* TAB 4: DATES, GEOGRAPHY & BEHAVIOR */}
            {activeTab === "behavior" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Last Purchase & First Purchase Date Ranges */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted block">بازه زمانی خرید و کوهورت جذب</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDateModalTarget("last")}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        filters.lastFrom || filters.lastTo
                          ? "bg-accent text-on-accent border-accent"
                          : "bg-elevated border-line text-ink hover:border-accent"
                      }`}
                    >
                      <span>📅 آخرین خرید:</span>
                      <span>
                        {filters.lastFrom || filters.lastTo
                          ? `${filters.lastFrom ? formatJalali(filters.lastFrom) : "ابتدا"} تا ${
                              filters.lastTo ? formatJalali(filters.lastTo) : "امروز"
                            }`
                          : "انتخاب بازه"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDateModalTarget("first")}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        filters.firstFrom || filters.firstTo
                          ? "bg-accent text-on-accent border-accent"
                          : "bg-elevated border-line text-ink hover:border-accent"
                      }`}
                    >
                      <span>✨ تاریخ جذب (اولین خرید):</span>
                      <span>
                        {filters.firstFrom || filters.firstTo
                          ? `${filters.firstFrom ? formatJalali(filters.firstFrom) : "ابتدا"} تا ${
                              filters.firstTo ? formatJalali(filters.firstTo) : "امروز"
                            }`
                          : "انتخاب بازه"}
                      </span>
                    </button>
                  </div>

                  {/* Quick Recency Shortcuts */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => applyDatePreset(7)}
                      className="px-2 py-1 rounded-lg bg-elevated border border-line text-muted hover:text-ink text-[11px]"
                    >
                      ۷ روز اخیر
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(30)}
                      className="px-2 py-1 rounded-lg bg-elevated border border-line text-muted hover:text-ink text-[11px]"
                    >
                      ۳۰ روز اخیر
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(90, true)}
                      className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-medium"
                    >
                      +۹۰ روز عدم خرید
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(180, true)}
                      className="px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[11px] font-medium"
                    >
                      +۱۸۰ روز عدم خرید (ریزش)
                    </button>
                  </div>
                </div>

                {/* City / Province Filter */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted">شهر یا استان مشتری</span>
                    {filters.city && (
                      <button
                        type="button"
                        onClick={() => updateFilter("city", "")}
                        className="text-[11px] text-accent hover:underline"
                      >
                        پاک کردن شهر
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CITY_PRESETS.map((cityItem) => {
                      const active = filters.city === cityItem;
                      return (
                        <button
                          key={cityItem}
                          type="button"
                          onClick={() => updateFilter("city", active ? "" : cityItem)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent font-bold"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {cityItem}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={filters.city}
                    onChange={(e) => updateFilter("city", e.target.value)}
                    placeholder="نام شهر یا استان (مثلاً مازندران، گلستان، مشهد)..."
                    className="w-full px-3 py-1.5 rounded-xl bg-elevated border border-line text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Order Behavior (Refunds / Canceled) */}
                <div className="space-y-1.5 pt-2 border-t border-line/50">
                  <span className="text-[11px] font-bold text-muted block">رفتار مرجوعی و لغو سفارش</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ORDER_BEHAVIOR_OPTIONS.map((ob) => {
                      const active = filters.orderBehavior === ob.value;
                      return (
                        <button
                          key={ob.value}
                          type="button"
                          onClick={() => updateFilter("orderBehavior", ob.value)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent font-bold"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {ob.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Profile Completeness */}
                <div className="space-y-1.5 pt-2 border-t border-line/50">
                  <span className="text-[11px] font-bold text-muted block">وضعیت تکمیل پرونده</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PROFILE_STATE_OPTIONS.map((ps) => {
                      const active = filters.profileState === ps.value;
                      return (
                        <button
                          key={ps.value}
                          type="button"
                          onClick={() => updateFilter("profileState", ps.value)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-accent text-on-accent font-bold"
                              : "bg-elevated text-muted border border-line hover:text-ink"
                          }`}
                        >
                          {ps.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Row 4: Removable Active Filter Chips (Only visible when filters are active) */}
        {tabCounts.total > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-line/70">
            <span className="text-[11px] text-muted font-medium ml-1">فیلترهای فعال:</span>

            {appliedSearch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>جستجو: {appliedSearch}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setAppliedSearch("");
                    setPage(1);
                  }}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {filters.population !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>جامعه: {filters.population === "purchasing" ? "خریداران" : "بدون خرید"}</span>
                <button type="button" onClick={() => updateFilter("population", "all")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.channel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>کانال: {CHANNEL_OPTIONS.find((c) => c.value === filters.channel)?.label || filters.channel}</span>
                <button type="button" onClick={() => updateFilter("channel", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.tier && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>سطح: {tierChoices.find((t) => t.value === filters.tier)?.label || filters.tier}</span>
                <button type="button" onClick={() => updateFilter("tier", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.salesLines.map((line) => (
              <span
                key={line}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25"
              >
                <span>
                  {SALES_LINE_OPTIONS.find((s) => s.value === line)?.label || line}
                  {filters.salesLines.length > 1 ? ` (${filters.salesLinesMode === "any" ? "OR" : "AND"})` : ""}
                </span>
                <button type="button" onClick={() => toggleSalesLine(line)} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            ))}

            {(filters.minAmount || filters.maxAmount) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>
                  مبلغ خرید:{" "}
                  {filters.minAmount && filters.maxAmount
                    ? `${formatNumber(Number(filters.minAmount))} تا ${formatNumber(Number(filters.maxAmount))}`
                    : filters.minAmount
                    ? `+${formatNumber(Number(filters.minAmount))} تومان`
                    : `تا ${formatNumber(Number(filters.maxAmount))} تومان`}
                </span>
                <button
                  type="button"
                  onClick={() => patchFilters({ minAmount: "", maxAmount: "" })}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {(filters.minPurchases || filters.maxPurchases) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>
                  فاکتور:{" "}
                  {filters.minPurchases && filters.maxPurchases
                    ? `${filters.minPurchases} تا ${filters.maxPurchases}`
                    : filters.minPurchases
                    ? `حداقل ${filters.minPurchases}`
                    : `حداکثر ${filters.maxPurchases}`}
                </span>
                <button
                  type="button"
                  onClick={() => patchFilters({ minPurchases: "", maxPurchases: "" })}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {filters.paymentMethod && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>
                  {PAYMENT_METHOD_OPTIONS.find((p) => p.value === filters.paymentMethod)?.label || filters.paymentMethod}
                </span>
                <button type="button" onClick={() => updateFilter("paymentMethod", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.hasDiscount && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>
                  {DISCOUNT_FILTER_OPTIONS.find((d) => d.value === filters.hasDiscount)?.label || filters.hasDiscount}
                </span>
                <button type="button" onClick={() => updateFilter("hasDiscount", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.size && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>سایز: {filters.size}</span>
                <button type="button" onClick={() => updateFilter("size", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.category && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>دسته: {filters.category}</span>
                <button type="button" onClick={() => updateFilter("category", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.city && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>شهر: {filters.city}</span>
                <button type="button" onClick={() => updateFilter("city", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.orderBehavior && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>
                  {ORDER_BEHAVIOR_OPTIONS.find((o) => o.value === filters.orderBehavior)?.label || filters.orderBehavior}
                </span>
                <button type="button" onClick={() => updateFilter("orderBehavior", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {filters.profileState && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>
                  {PROFILE_STATE_OPTIONS.find((p) => p.value === filters.profileState)?.label || filters.profileState}
                </span>
                <button type="button" onClick={() => updateFilter("profileState", "")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {(filters.lastFrom || filters.lastTo) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>
                  آخرین خرید:{" "}
                  {filters.lastFrom && filters.lastTo
                    ? `${formatJalali(filters.lastFrom)} تا ${formatJalali(filters.lastTo)}`
                    : filters.lastFrom
                    ? `از ${formatJalali(filters.lastFrom)}`
                    : `تا ${formatJalali(filters.lastTo)}`}
                </span>
                <button type="button" onClick={() => applyDatePreset(null)} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            {(filters.firstFrom || filters.firstTo) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>
                  تاریخ جذب:{" "}
                  {filters.firstFrom && filters.firstTo
                    ? `${formatJalali(filters.firstFrom)} تا ${formatJalali(filters.firstTo)}`
                    : filters.firstFrom
                    ? `از ${formatJalali(filters.firstFrom)}`
                    : `تا ${formatJalali(filters.firstTo)}`}
                </span>
                <button
                  type="button"
                  onClick={() => patchFilters({ firstFrom: "", firstTo: "" })}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {filters.sort !== "last_purchase" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-bold text-[11px] border border-accent/25">
                <span>سورت: {SORT_OPTIONS.find((s) => s.value === filters.sort)?.label || filters.sort}</span>
                <button type="button" onClick={() => updateFilter("sort", "last_purchase")} className="hover:text-rose-500 mr-0.5">
                  ✕
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] text-rose-500 hover:text-rose-600 font-bold px-2 py-0.5 rounded-lg hover:bg-rose-500/10 transition-colors mr-auto cursor-pointer"
            >
              پاک کردن همه
            </button>
          </div>
        )}

        {/* Results Counter Bar */}
        <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-line/60">
          <div>
            نمایش <span className="font-bold text-ink tabular">{data?.results?.length || 0}</span> از{" "}
            <span className="font-bold text-ink tabular">{formatNumber(data?.total || 0)}</span> مشتری
          </div>
          {data && data.total > 0 && (
            <div>
              صفحه <span className="font-bold text-ink tabular">{formatNumber(page)}</span> از{" "}
              <span className="font-bold text-ink tabular">{formatNumber(totalPages)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. CUSTOMER LIST CONTENT (Table on Desktop, Cards on Mobile)  */}
      {/* ============================================================== */}
      {loading && !data ? (
        <div className="bento-card p-6 glass-rim shadow-soft space-y-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      ) : error && !data ? (
        <ErrorState onRetry={() => setRetry((v) => v + 1)} />
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          title="مشتری‌ای با فیلترهای انتخابی یافت نشد."
          body="معیارهای فیلتر را تغییر دهید یا از دکمه پاک کردن همه فیلترها استفاده کنید."
        />
      ) : (
        <div className="bento-card p-4 sm:p-6 glass-rim shadow-soft overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="text-muted border-b border-line pb-3 font-semibold">
                  <th className="py-3 px-3">نام و مشخصات مشتری</th>
                  <th className="py-3 px-3">شماره تماس</th>
                  <th className="py-3 px-3">رتبه وفاداری</th>
                  <th className="py-3 px-3">کل خرید (LTV)</th>
                  <th className="py-3 px-3">تعداد فاکتور</th>
                  <th className="py-3 px-3">آخرین خرید</th>
                  <th className="py-3 px-3">کانال و شعب</th>
                  <th className="py-3 px-3">وضعیت</th>
                  <th className="py-3 px-3 text-center">شناسنامه ۳۶۰</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((customer, idx) => {
                  const display = customerDisplayName(customer);
                  const gradient = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
                  const initials = getInitials(display.name);

                  return (
                    <tr key={customer.id} className="hover:bg-hover transition-colors">
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-2xl bg-gradient-to-tr ${gradient} flex items-center justify-center font-bold text-white text-xs shadow-sm shrink-0`}>
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-ink flex items-center gap-1.5">
                              <span>{display.name}</span>
                              {customer.tier_label && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-accent/15 text-accent font-extrabold border border-accent/25">
                                  {customer.tier_label}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-faint font-mono mt-0.5">
                              شناسه: #EL-{customer.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Mobile */}
                      <td className="py-3.5 px-3 font-mono tabular text-muted ltr-iso">
                        {customer.mobile ? formatMobile(customer.mobile) : "—"}
                      </td>

                      {/* Tier Badge */}
                      <td className="py-3.5 px-3">{getTierBadge(customer)}</td>

                      {/* LTV */}
                      <td className="py-3.5 px-3">
                        <div className="font-black text-ink tabular text-sm">
                          {formatNumber(customer.lifetime_purchase_amount || 0)}
                        </div>
                        <div className="text-[10px] text-muted">تومان</div>
                      </td>

                      {/* Orders Count */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-ink tabular">
                          {formatNumber(customer.order_count)} خرید
                        </div>
                        <div className="text-[10px] text-muted">
                          {formatNumber(customer.online_count)} آنلاین • {formatNumber(customer.pos_count)} حضوری
                        </div>
                      </td>

                      {/* Last Purchase */}
                      <td className="py-3.5 px-3">
                        <div className="font-medium text-ink font-mono">
                          {customer.last_purchase_at ? formatDate(customer.last_purchase_at) : "—"}
                        </div>
                        {customer.days_since_last_purchase != null && (
                          <div
                            className={`text-[10px] font-medium ${
                              customer.days_since_last_purchase > 180
                                ? "text-rose-500 font-bold"
                                : customer.days_since_last_purchase > 90
                                ? "text-amber-500 font-bold"
                                : "text-accent"
                            }`}
                          >
                            {customer.days_since_last_purchase === 0
                              ? "امروز"
                              : `${formatNumber(customer.days_since_last_purchase)} روز قبل`}
                          </div>
                        )}
                      </td>

                      {/* Sales Lines & Channel */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1">
                          {customer.channel_label && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[9px] font-bold">
                              {customer.channel_label}
                            </span>
                          )}
                          {customer.sales_line_labels && customer.sales_line_labels.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {customer.sales_line_labels.map((lbl) => (
                                <span
                                  key={lbl}
                                  className="px-1.5 py-0.5 rounded-md bg-elevated text-muted border border-line text-[9px] font-semibold"
                                >
                                  {lbl}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-semibold text-[11px] ${
                            customer.status_label === "فعال"
                              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                              : "bg-elevated text-muted border border-line"
                          }`}
                        >
                          {customer.status_label || "فعال"}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-3 text-center">
                        <Link
                          to={`/customers/${customer.id}`}
                          className="px-3 py-1.5 rounded-xl bg-accent/10 hover:bg-accent text-accent hover:text-on-accent font-bold text-xs transition-all inline-flex items-center gap-1 shadow-sm"
                        >
                          <span>شناسنامه ۳۶۰</span>
                          <span>←</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards View (Optimized for handheld) */}
          <div className="md:hidden space-y-3">
            {data.results.map((customer, idx) => {
              const display = customerDisplayName(customer);
              const gradient = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
              const initials = getInitials(display.name);

              return (
                <div
                  key={customer.id}
                  className="bento-card p-3.5 glass-rim shadow-sm space-y-2.5 border-r-4 border-r-accent"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-9 w-9 rounded-xl bg-gradient-to-tr ${gradient} flex items-center justify-center font-bold text-white text-xs shrink-0`}>
                        {initials}
                      </div>
                      <div>
                        <div className="font-extrabold text-ink text-xs">{display.name}</div>
                        <div className="text-[10px] text-muted font-mono ltr-iso">
                          {customer.mobile ? formatMobile(customer.mobile) : "—"}
                        </div>
                      </div>
                    </div>
                    {getTierBadge(customer)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line text-[11px]">
                    <div>
                      <span className="text-[10px] text-muted block">مجموع خرید (LTV):</span>
                      <span className="font-black text-ink tabular text-xs">
                        {formatToman(customer.lifetime_purchase_amount || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block">آخرین خرید:</span>
                      <div className="flex items-center gap-1 font-bold text-accent">
                        <span>{customer.last_purchase_at ? formatDate(customer.last_purchase_at) : "—"}</span>
                        {customer.days_since_last_purchase != null && (
                          <span className="text-[9px] text-muted font-normal">
                            ({customer.days_since_last_purchase} روز پیش)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
                    <div className="flex items-center gap-1">
                      {customer.channel_label && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold">
                          {customer.channel_label}
                        </span>
                      )}
                      {customer.sales_line_labels?.slice(0, 2).map((lbl) => (
                        <span key={lbl} className="text-[9px] px-1.5 py-0.5 rounded bg-elevated border border-line text-muted">
                          {lbl}
                        </span>
                      ))}
                      <span className="text-[10px] text-muted font-mono mr-1">
                        {formatNumber(customer.order_count)} فاکتور
                      </span>
                    </div>
                    <Link
                      to={`/customers/${customer.id}`}
                      className="px-2.5 py-1 rounded-lg bg-accent text-on-accent font-bold text-[10px] shadow-sm flex items-center gap-1"
                    >
                      <span>شناسنامه ۳۶۰</span>
                      <span>←</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Bar */}
          <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <div>
              نمایش صفحه {formatNumber(page)} از {formatNumber(totalPages)} (کل: {formatNumber(data.total)} مشتری)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-xl bg-elevated border border-line text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-hover transition-colors"
              >
                قبلی
              </button>
              <span className="px-3 py-1.5 rounded-xl bg-accent text-on-accent font-bold shadow-md tabular">
                {formatNumber(page)}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-xl bg-elevated border border-line text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-hover transition-colors"
              >
                بعدی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persian Jalali Date Range Picker Modal (shared for Last Purchase & First Purchase) */}
      <JalaliRangeModal
        isOpen={dateModalTarget !== null}
        onClose={() => setDateModalTarget(null)}
        initialFrom={
          dateModalTarget === "first"
            ? filters.firstFrom || todayIso()
            : filters.lastFrom || todayIso()
        }
        initialTo={
          dateModalTarget === "first"
            ? filters.firstTo || todayIso()
            : filters.lastTo || todayIso()
        }
        onApply={(fromIso, toIso) => {
          if (dateModalTarget === "first") {
            patchFilters({ firstFrom: fromIso, firstTo: toIso });
          } else {
            patchFilters({ lastFrom: fromIso, lastTo: toIso });
          }
          setDateModalTarget(null);
        }}
      />
    </div>
  );
}
