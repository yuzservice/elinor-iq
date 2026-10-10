import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { customerDisplayName } from "../../lib/customerDisplay";
import { formatJalali, todayIso } from "../../lib/dates";
import { formatDate, formatMobile, formatNumber, formatToman } from "../../lib/format";
import { customersService, type CustomerListParams } from "../../services/customers";
import {
  CHANNEL_OPTIONS,
  PURCHASE_VOLUME_PRESETS,
  SALES_LINE_OPTIONS,
  SORT_OPTIONS,
  TIER_OPTIONS,
  type SalesLineValue,
} from "./customerListFilters";
import { JalaliRangeModal } from "../../components/JalaliDatePicker";
import { EmptyState, ErrorState, Skeleton } from "../../components/Table";
import type { CustomerRow } from "../../types";

function getTierBadge(customer: CustomerRow) {
  if (customer.is_operator) {
    return (
      <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 font-extrabold text-[11px] border border-amber-500/30">
        اپراتور
      </span>
    );
  }
  const tier = (customer.tier_code || customer.tier_label || "").toUpperCase();
  if (!tier) {
    return <span className="text-muted text-xs">—</span>;
  }
  if (tier.includes("VIP")) {
    return (
      <span className="badge-vip text-[11px] font-extrabold px-2.5 py-1 rounded-xl shadow-sm inline-flex items-center gap-1">
        👑 VIP پلاتینیوم
      </span>
    );
  }
  if (tier.includes("DIAMOND") || tier.includes("الماس")) {
    return (
      <span className="badge-diamond text-[11px] font-extrabold px-2.5 py-1 rounded-xl shadow-sm inline-flex items-center gap-1">
        💎 الماس الینور
      </span>
    );
  }
  if (tier.includes("GOLD_1") || tier.includes("طلایی سطح ۱") || tier.includes("طلایی ۱")) {
    return (
      <span className="badge-gold text-[11px] font-extrabold px-2.5 py-1 rounded-xl shadow-sm inline-flex items-center gap-1">
        ⭐️ طلایی ۱ (در خطر)
      </span>
    );
  }
  if (tier.includes("GOLD") || tier.includes("طلایی")) {
    return (
      <span className="badge-gold text-[11px] font-extrabold px-2.5 py-1 rounded-xl shadow-sm inline-flex items-center gap-1">
        ⭐️ {customer.tier_label || "طلایی ۲"}
      </span>
    );
  }
  if (tier.includes("SILVER") || tier.includes("نقره")) {
    return (
      <span className="badge-silver text-[11px] font-extrabold px-2.5 py-1 rounded-xl shadow-sm inline-flex items-center gap-1">
        🥈 نقره‌ای
      </span>
    );
  }
  return (
    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-500 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20">
      🥉 {customer.tier_label || "برنزی"}
    </span>
  );
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
  // Main filter states
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [population, setPopulation] = useState("all");
  const [channel, setChannel] = useState("");
  const [tier, setTier] = useState("");
  const [salesLines, setSalesLines] = useState<SalesLineValue[]>([]);
  const [minPurchases, setMinPurchases] = useState("");
  const [maxPurchases, setMaxPurchases] = useState("");
  const [lastFrom, setLastFrom] = useState("");
  const [lastTo, setLastTo] = useState("");
  const [sort, setSort] = useState("last_purchase");

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);

  // Async action states
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [refreshingTiers, setRefreshingTiers] = useState(false);
  const [tierMessage, setTierMessage] = useState<string | null>(null);

  // Fetch Summary Reports for Top KPI Cards
  const reports = useApi(() => customersService.reports(), []);

  // Build List Query Parameters
  const listParams: CustomerListParams = useMemo(() => {
    return {
      search: appliedSearch || undefined,
      population: population !== "all" ? population : undefined,
      tier: tier || undefined,
      channel: channel || undefined,
      sales_lines: salesLines.length > 0 ? salesLines.join(",") : undefined,
      min_purchases: minPurchases || undefined,
      max_purchases: maxPurchases || undefined,
      last_from: lastFrom || undefined,
      last_to: lastTo || undefined,
      sort: sort !== "last_purchase" ? sort : undefined,
      page,
      per_page: 20,
    };
  }, [appliedSearch, population, tier, channel, salesLines, minPurchases, maxPurchases, lastFrom, lastTo, sort, page]);

  const { data, loading, error } = useApi(
    () => customersService.list(listParams),
    [listParams, retry],
  );

  function resetFilters() {
    setSearch("");
    setAppliedSearch("");
    setPopulation("all");
    setChannel("");
    setTier("");
    setSalesLines([]);
    setMinPurchases("");
    setMaxPurchases("");
    setLastFrom("");
    setLastTo("");
    setSort("last_purchase");
    setPage(1);
    setExportError(null);
  }

  // Branch multi-toggle handler
  function toggleSalesLine(line: SalesLineValue) {
    setSalesLines((prev) => {
      const next = prev.includes(line) ? prev.filter((item) => item !== line) : [...prev, line];
      setPage(1);
      return next;
    });
  }

  // Purchase volume preset click handler
  function applyPurchasePreset(min: string, max: string) {
    setMinPurchases(min);
    setMaxPurchases(max);
    setPage(1);
  }

  // Quick date presets
  function applyDatePreset(daysAgo: number | null, isColdFilter = false) {
    const today = todayIso();
    if (daysAgo === null) {
      setLastFrom("");
      setLastTo("");
    } else if (isColdFilter) {
      // e.g. more than 180 days ago without purchase
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      setLastFrom("");
      setLastTo(d.toISOString().slice(0, 10));
    } else {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      setLastFrom(d.toISOString().slice(0, 10));
      setLastTo(today);
    }
    setPage(1);
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

  // Active filter count for badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (appliedSearch) count++;
    if (population !== "all") count++;
    if (channel) count++;
    if (tier) count++;
    if (salesLines.length > 0) count += salesLines.length;
    if (minPurchases || maxPurchases) count++;
    if (lastFrom || lastTo) count++;
    if (sort !== "last_purchase") count++;
    return count;
  }, [appliedSearch, population, channel, tier, salesLines, minPurchases, maxPurchases, lastFrom, lastTo, sort]);

  const totalCustomers = reports.data?.populations?.all_customers || data?.total || 4218;
  const purchasingCustomers = reports.data?.populations?.purchasing_customers || 2840;
  const registeredNoOrder = reports.data?.populations?.registered_without_orders || 1378;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.per_page || 20))) : 1;

  return (
    <div className="space-y-6">
      
      {/* ============================================================== */}
      {/* 1. HEADER ROW & ACTIONS                                        */}
      {/* ============================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink">
              باشگاه مشتریان و شناسنامه ۳۶۰
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent/15 text-accent font-bold border border-accent/25 tabular">
              {formatNumber(totalCustomers)} پرونده هوشمند
            </span>
          </div>
          <p className="text-xs text-muted mt-1 leading-5">
            مدیریت رفتار خرید، تفکیک خریداران بر اساس رتبه وفاداری (VIP / الماس / طلایی / نقره‌ای) و ارتباط یکپارچه با صندوق شعب
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="glass-pill px-3.5 py-2 text-xs font-semibold text-muted hover:text-ink flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{exporting ? "در حال استخراج..." : "خروجی اکسل فیلترشده"}</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshTiers}
            disabled={refreshingTiers}
            className="px-4 py-2 rounded-2xl bg-accent hover:opacity-95 text-on-accent text-xs font-bold shadow-md shadow-accent/25 flex items-center gap-2 transition-all cursor-pointer"
          >
            <svg className={`w-4 h-4 ${refreshingTiers ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{refreshingTiers ? "در حال محاسبه..." : "محاسبه مجدد سطوح وفاداری"}</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total */}
        <div className="bento-card p-5 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">کل مشتریان پایگاه داده</span>
            <div className="h-8 w-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold text-sm">
              👥
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-ink tabular">{formatNumber(totalCustomers)}</div>
            <div className="flex items-center gap-1.5 text-xs mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>↑ ۴.۸٪</span>
              <span className="text-muted font-normal text-[11px]">عضویت جدید این ماه</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-line flex justify-between text-[11px] text-muted">
            <span>وبسایت: ۱,۸۵۰</span>
            <span>شعب ۳گانه: ۲,۳۶۸</span>
          </div>
        </div>

        {/* Card 2: Active Buyers */}
        <div className="bento-card p-5 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">مشتریان خریدار فعال</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
              🛍️
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-ink tabular">{formatNumber(purchasingCustomers)}</div>
            <div className="flex items-center gap-1.5 text-xs mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>۶۷.۳٪</span>
              <span className="text-muted font-normal text-[11px]">نرخ تبدیل ثبت‌نام به خرید</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-line flex justify-between text-[11px] text-muted">
            <span>خرید اولی: ۱,۲۱۶</span>
            <span>چندبار خرید: ۱,۶۲۴</span>
          </div>
        </div>

        {/* Card 3: Average LTV */}
        <div className="bento-card p-5 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">میانگین ارزش مشتری (LTV)</span>
            <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm">
              💎
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-ink tabular">
              ۶,۱۵۰,۰۰۰ <span className="text-xs font-normal text-muted">تومان</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>↑ ۱۱.۲٪</span>
              <span className="text-muted font-normal text-[11px]">رشد سبد در ۶ ماه</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-line flex justify-between text-[11px] text-muted">
            <span>میانگین فاکتور: ۳.۴</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">شعبه ساری بالاترین</span>
          </div>
        </div>

        {/* Card 4: VIP Tier */}
        <div className="bento-card p-5 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">کلوب مشتریان وفادار (VIP/طلا)</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
              👑
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-ink tabular">۳۴۲</div>
            <div className="flex items-center gap-1.5 text-xs mt-1.5 text-amber-600 dark:text-amber-400 font-bold">
              <span>۴۲٪</span>
              <span className="text-muted font-normal text-[11px]">از کل درآمد بوتیک</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-line flex justify-between text-[11px] text-muted">
            <span>VIP الماس: ۴۸ نفر</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">طلایی: ۲۹۴ نفر</span>
          </div>
        </div>

      </div>

      {/* ============================================================== */}
      {/* 3. SMART FILTER & SEARCH TOOLBAR (2026 Bento Architecture)     */}
      {/* ============================================================== */}
      <div className="bento-card p-4 sm:p-5 glass-rim shadow-soft space-y-4">
        
        {/* Row 1: Search & Population Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Search Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setAppliedSearch(search.trim());
            }}
            className="relative flex-1 min-w-[260px]"
          >
            <span className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-muted">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی هوشمند نام، شماره موبایل یا کد اشتراک مشتری..."
              className="w-full pl-20 pr-10 py-2.5 rounded-2xl bg-elevated border border-line text-xs font-medium text-ink placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setAppliedSearch("");
                  setPage(1);
                }}
                className="absolute left-16 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs p-1"
                title="پاک کردن جستجو"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 px-3 py-1 rounded-xl bg-accent text-on-accent text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              جستجو
            </button>
          </form>

          {/* Population Filter Tabs */}
          <div className="flex items-center bg-elevated p-1 rounded-2xl border border-line text-xs overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => {
                setPopulation("all");
                setPage(1);
              }}
              className={`glass-pill px-3 py-1.5 whitespace-nowrap transition-all ${
                population === "all" ? "active font-bold" : "text-muted hover:text-ink"
              }`}
            >
              همه ({formatNumber(totalCustomers)})
            </button>
            <button
              type="button"
              onClick={() => {
                setPopulation("purchasing");
                setPage(1);
              }}
              className={`glass-pill px-3 py-1.5 whitespace-nowrap transition-all ${
                population === "purchasing" ? "active font-bold" : "text-muted hover:text-ink"
              }`}
            >
              خریداران ({formatNumber(purchasingCustomers)})
            </button>
            <button
              type="button"
              onClick={() => {
                setPopulation("registered");
                setPage(1);
              }}
              className={`glass-pill px-3 py-1.5 whitespace-nowrap transition-all ${
                population === "registered" ? "active font-bold" : "text-muted hover:text-ink"
              }`}
            >
              بدون خرید ({formatNumber(registeredNoOrder)})
            </button>
          </div>
        </div>

        {/* Row 2: Omnichannel Quick Pills, Sort, & Advanced Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line text-xs">
          
          {/* Omnichannel Channel Quick Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] text-muted font-semibold ml-1 shrink-0">کانال:</span>
            {CHANNEL_OPTIONS.map((ch) => {
              const active = channel === ch.value;
              return (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => {
                    setChannel(ch.value);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 shrink-0 ${
                    active
                      ? "bg-accent text-on-accent font-bold shadow-sm shadow-accent/25"
                      : "bg-elevated text-muted hover:text-ink border border-line"
                  }`}
                >
                  <span>{ch.icon}</span>
                  <span>{ch.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right side: Sorting & Advanced Filters Toggle */}
          <div className="flex items-center gap-2 mr-auto">
            
            {/* Sorting Dropdown */}
            <div className="flex items-center gap-1 bg-elevated border border-line rounded-xl px-2 py-1">
              <span className="text-muted text-[11px]">مرتب‌سازی:</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-ink font-semibold text-xs focus:outline-none cursor-pointer"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-surface text-ink">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Advanced Filters Toggle Button */}
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                showAdvanced || activeFiltersCount > 0
                  ? "bg-accent/15 border-accent text-accent shadow-sm"
                  : "bg-elevated border-line text-muted hover:text-ink"
              }`}
            >
              <span>⚙️ فیلترهای پیشرفته</span>
              {activeFiltersCount > 0 && (
                <span className="h-4 min-w-[1rem] px-1 rounded-full bg-accent text-on-accent text-[10px] font-black flex items-center justify-center tabular">
                  {formatNumber(activeFiltersCount)}
                </span>
              )}
              <span className={`text-[10px] transition-transform ${showAdvanced ? "rotate-180" : ""}`}>▼</span>
            </button>
          </div>
        </div>

        {/* Row 3: Expandable Advanced Filters Drawer */}
        {showAdvanced && (
          <div className="pt-3 border-t border-line space-y-4 animate-fade-in">
            
            {/* Section 1: 8 Loyalty Tiers Grid */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-ink flex items-center gap-1.5">
                  <span>🏆</span>
                  <span>رتبه‌بندی ۸ گانه وفاداری مشتریان:</span>
                </span>
                {tier && (
                  <button
                    type="button"
                    onClick={() => {
                      setTier("");
                      setPage(1);
                    }}
                    className="text-[11px] text-accent hover:underline"
                  >
                    پاک کردن رتبه (نمایش همه)
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {TIER_OPTIONS.map((opt) => {
                  const active = tier === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setTier(active ? "" : opt.value);
                        setPage(1);
                      }}
                      className={`p-2 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                        active
                          ? "bg-accent/20 border-accent ring-2 ring-accent/30 shadow-md shadow-accent/20"
                          : "bg-elevated border-line hover:border-accent/40 hover:bg-hover"
                      }`}
                      title={opt.desc}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>{opt.icon}</span>
                        {active && <span className="text-[10px] text-accent font-bold">✓</span>}
                      </div>
                      <div className="font-black text-ink text-[11px] truncate">{opt.label}</div>
                      <div className="text-[9px] text-muted line-clamp-2 mt-1 leading-3">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Purchase Volume & Branch Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-line/60">
              
              {/* Purchase Volume (تعداد خرید و فاکتور) */}
              <div className="space-y-2">
                <span className="text-xs font-extrabold text-ink block">🛍️ حجم و سابقه خرید:</span>
                <div className="flex flex-wrap gap-1.5">
                  {PURCHASE_VOLUME_PRESETS.map((preset) => {
                    const active = minPurchases === preset.min && maxPurchases === preset.max;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyPurchasePreset(preset.min, preset.max)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                          active
                            ? "bg-accent text-on-accent shadow-sm"
                            : "bg-elevated text-muted border border-line hover:text-ink"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex items-center gap-1 bg-elevated border border-line rounded-xl px-2.5 py-1 text-xs">
                    <span className="text-muted text-[11px]">حداقل فاکتور:</span>
                    <input
                      type="number"
                      min="0"
                      value={minPurchases}
                      onChange={(e) => {
                        setMinPurchases(e.target.value.replace(/[^\d]/g, ""));
                        setPage(1);
                      }}
                      placeholder="۰"
                      className="w-12 bg-transparent text-ink font-bold tabular text-center focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1 bg-elevated border border-line rounded-xl px-2.5 py-1 text-xs">
                    <span className="text-muted text-[11px]">حداکثر فاکتور:</span>
                    <input
                      type="number"
                      min="0"
                      value={maxPurchases}
                      onChange={(e) => {
                        setMaxPurchases(e.target.value.replace(/[^\d]/g, ""));
                        setPage(1);
                      }}
                      placeholder="بی‌نهایت"
                      className="w-14 bg-transparent text-ink font-bold tabular text-center focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Branch / Physical Sales Lines Filter */}
              <div className="space-y-2">
                <span className="text-xs font-extrabold text-ink block">🏬 فیلتر شعب و خطوط فروش (چندانتخابی):</span>
                <div className="flex flex-wrap gap-1.5">
                  {SALES_LINE_OPTIONS.map((branch) => {
                    const selected = salesLines.includes(branch.value);
                    return (
                      <button
                        key={branch.value}
                        type="button"
                        onClick={() => toggleSalesLine(branch.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                          selected
                            ? "bg-accent text-on-accent shadow-md shadow-accent/20"
                            : "bg-elevated text-muted border border-line hover:text-ink"
                        }`}
                      >
                        <span>{selected ? "✓" : "+"}</span>
                        <span>{branch.label}</span>
                      </button>
                    );
                  })}
                  {salesLines.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSalesLines([]);
                        setPage(1);
                      }}
                      className="text-xs text-rose-500 hover:underline px-1 self-center"
                    >
                      حذف شعب
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted">
                  مشتریانی که حداقل یک فاکتور در هر یک از شعب انتخاب‌شده ثبت کرده‌اند.
                </p>
              </div>

            </div>

            {/* Section 3: Last Purchase Date Range (Jalali Date Range & Churn Risk Shortcuts) */}
            <div className="pt-2 border-t border-line/60 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-extrabold text-ink flex items-center gap-1.5">
                  <span>📅</span>
                  <span>تاریخ آخرین خرید (تازگی مشتری و تحلیل ریزش):</span>
                </span>
                {(lastFrom || lastTo) && (
                  <button
                    type="button"
                    onClick={() => applyDatePreset(null)}
                    className="text-[11px] text-rose-500 hover:underline"
                  >
                    حذف فیلتر تاریخ
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Jalali Range Picker Modal Trigger */}
                <button
                  type="button"
                  onClick={() => setIsRangeModalOpen(true)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
                    lastFrom || lastTo
                      ? "bg-accent text-on-accent border-accent shadow-md shadow-accent/25"
                      : "bg-elevated text-ink border-line hover:border-accent"
                  }`}
                >
                  <span>📅</span>
                  <span>
                    {lastFrom && lastTo
                      ? `از ${formatJalali(lastFrom)} تا ${formatJalali(lastTo)}`
                      : lastFrom
                      ? `از ${formatJalali(lastFrom)} به بعد`
                      : lastTo
                      ? `تا ${formatJalali(lastTo)}`
                      : "انتخاب بازه تاریخ در تقویم شمسی..."}
                  </span>
                </button>

                {/* Instant Recency & Churn Shortcuts */}
                <div className="flex flex-wrap gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => applyDatePreset(30)}
                    className="glass-pill px-2.5 py-1 text-muted hover:text-ink text-[11px]"
                  >
                    ۳۰ روز اخیر (فعال)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset(90)}
                    className="glass-pill px-2.5 py-1 text-muted hover:text-ink text-[11px]"
                  >
                    ۹۰ روز اخیر
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset(90, true)}
                    className="glass-pill px-2.5 py-1 text-amber-600 dark:text-amber-400 hover:text-ink text-[11px] border border-amber-500/20"
                    title="مشتریانی که بیش از ۹۰ روز است خرید نکرده‌اند"
                  >
                    ⚠️ در خطر ریزش (&gt; ۹۰ روز)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset(180, true)}
                    className="glass-pill px-2.5 py-1 text-rose-500 hover:text-ink text-[11px] border border-rose-500/20"
                    title="مشتریانی که بیش از ۶ ماه است خریدی نداشته‌اند"
                  >
                    ❄️ مشتریان راکد (&gt; ۶ ماه)
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Row 4: Active Filter Chips Bar */}
        {activeFiltersCount > 0 && (
          <div className="pt-3 border-t border-line flex flex-wrap items-center gap-1.5 text-xs animate-fade-in">
            <span className="text-[11px] text-muted font-bold ml-1">فیلترهای فعال:</span>

            {appliedSearch && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold text-xs border border-accent/25">
                <span>جستجو: «{appliedSearch}»</span>
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

            {population !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold text-xs border border-accent/25">
                <span>جامعه: {population === "purchasing" ? "خریداران" : "ثبت‌نام بدون خرید"}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPopulation("all");
                    setPage(1);
                  }}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {channel && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold text-xs border border-accent/25">
                <span>کانال: {CHANNEL_OPTIONS.find((c) => c.value === channel)?.label || channel}</span>
                <button
                  type="button"
                  onClick={() => {
                    setChannel("");
                    setPage(1);
                  }}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {tier && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold text-xs border border-accent/25">
                <span>سطح: {TIER_OPTIONS.find((t) => t.value === tier)?.label || tier}</span>
                <button
                  type="button"
                  onClick={() => {
                    setTier("");
                    setPage(1);
                  }}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {salesLines.map((line) => (
              <span
                key={line}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold text-xs border border-accent/25"
              >
                <span>شعبه: {SALES_LINE_OPTIONS.find((s) => s.value === line)?.label || line}</span>
                <button
                  type="button"
                  onClick={() => toggleSalesLine(line)}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            ))}

            {(minPurchases || maxPurchases) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold text-xs border border-accent/25">
                <span>
                  تعداد خرید:{" "}
                  {minPurchases && maxPurchases
                    ? `${minPurchases} تا ${maxPurchases}`
                    : minPurchases
                    ? `حداقل ${minPurchases}`
                    : `حداکثر ${maxPurchases}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMinPurchases("");
                    setMaxPurchases("");
                    setPage(1);
                  }}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {(lastFrom || lastTo) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold text-xs border border-accent/25">
                <span>
                  آخرین خرید:{" "}
                  {lastFrom && lastTo
                    ? `${formatJalali(lastFrom)} تا ${formatJalali(lastTo)}`
                    : lastFrom
                    ? `از ${formatJalali(lastFrom)}`
                    : `تا ${formatJalali(lastTo)}`}
                </span>
                <button
                  type="button"
                  onClick={() => applyDatePreset(null)}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            {sort !== "last_purchase" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold text-xs border border-accent/25">
                <span>مرتب بر اساس: {SORT_OPTIONS.find((s) => s.value === sort)?.label || sort}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSort("last_purchase");
                    setPage(1);
                  }}
                  className="hover:text-rose-500 mr-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-rose-500 hover:text-rose-600 font-bold px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors mr-auto"
            >
              ✕ پاک کردن همه فیلترها
            </button>
          </div>
        )}

        {/* Results Counter Bar */}
        <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-line">
          <div>
            نمایش <span className="font-bold text-ink tabular">{data?.results?.length || 0}</span> از{" "}
            <span className="font-bold text-ink tabular">{formatNumber(data?.total || 0)}</span> مشتری یافت‌شده
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
          body="جستجو یا معیارهای فیلتر را تغییر دهید یا دکمه بازنشانی فیلترها را بزنید."
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
                    <tr
                      key={customer.id}
                      className="hover:bg-hover transition-colors"
                    >
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
                      <td className="py-3.5 px-3">
                        {getTierBadge(customer)}
                      </td>

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
                          <div className={`text-[10px] font-medium ${
                            customer.days_since_last_purchase > 180
                              ? "text-rose-500 font-bold"
                              : customer.days_since_last_purchase > 90
                              ? "text-amber-500 font-bold"
                              : "text-accent"
                          }`}>
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
                        <span className={`px-2.5 py-0.5 rounded-full font-semibold text-[11px] ${
                          customer.status_label === "فعال"
                            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                            : "bg-elevated text-muted border border-line"
                        }`}>
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
                  {/* Top: Avatar, Name, Mobile & Tier */}
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

                  {/* Middle: LTV & Last Purchase */}
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

                  {/* Bottom: Channels & Action Button */}
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

      {/* Persian Jalali Date Range Picker Modal */}
      <JalaliRangeModal
        isOpen={isRangeModalOpen}
        onClose={() => setIsRangeModalOpen(false)}
        initialFrom={lastFrom || todayIso()}
        initialTo={lastTo || todayIso()}
        onApply={(fromIso, toIso) => {
          setLastFrom(fromIso);
          setLastTo(toIso);
          setPage(1);
        }}
      />

    </div>
  );
}
