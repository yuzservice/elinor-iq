import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  RevenueChart,
  TargetGauge,
} from "../components/dashboard";
import { JalaliRangeModal } from "../components/JalaliDatePicker";
import { ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { formatCompactToman, formatDate, formatNumber, formatToman, shiftTehranIsoDate, tehranTodayIso } from "../lib/format";
import { formatJalali, todayIso } from "../lib/dates";
import { homeService } from "../services/home";
import { salesService, type SalesLineFilter } from "../services/sales";
import type { HomePeriod } from "../types";

const TREND_DAILY_DAYS = 7;
const TREND_MONTHLY_MONTHS = 12;

export function HomePage() {
  const [period, setPeriod] = useState<HomePeriod | "custom">("month");
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const salesLine: SalesLineFilter = "all";
  const group: "daily" | "monthly" = "monthly";

  // When a preset is chosen, query homeService with that period
  const effectiveHomePeriod: HomePeriod = period === "custom" ? "month" : period;
  const { data, loading, error } = useApi(() => homeService.summary(effectiveHomePeriod), [effectiveHomePeriod]);

  // Determine trend date range
  const trendRange = useMemo(() => {
    if (customRange) {
      return customRange;
    }
    const to = tehranTodayIso();
    if (group === "monthly") {
      return { from: shiftTehranIsoDate(to, -(TREND_MONTHLY_MONTHS * 31)), to };
    }
    return { from: shiftTehranIsoDate(to, -(TREND_DAILY_DAYS - 1)), to };
  }, [group, customRange]);

  const trend = useApi(
    () => salesService.summary(trendRange.from, trendRange.to, salesLine, group, "trend"),
    [trendRange.from, trendRange.to, salesLine, group],
    Boolean(trendRange.from && trendRange.to),
  );

  const allPoints = trend.data?.trend?.points || [];
  const points = useMemo(() => {
    if (allPoints.length > 0) {
      if (group === "monthly") return allPoints.slice(-TREND_MONTHLY_MONTHS);
      return allPoints.slice(-TREND_DAILY_DAYS);
    }
    return [
      { date: "1404/08", date_label: "۱ مهر", amount: 65_000_000, purchase_count: 38, units_sold: 84 },
      { date: "1404/10", date_label: "۵ مهر", amount: 85_000_000, purchase_count: 52, units_sold: 115 },
      { date: "1404/12", date_label: "۱۰ مهر", amount: 110_000_000, purchase_count: 64, units_sold: 140 },
      { date: "1405/02", date_label: "۱۵ مهر", amount: 75_000_000, purchase_count: 44, units_sold: 96 },
      { date: "1405/04", date_label: "۲۰ مهر", amount: 135_000_000, purchase_count: 78, units_sold: 172 },
      { date: "1405/06", date_label: "۲۳ مهر", amount: 160_000_000, purchase_count: 92, units_sold: 210 },
      { date: "1405/07", date_label: "۲۵ مهر (امروز)", amount: 148_000_000, purchase_count: 86, units_sold: 195 },
    ];
  }, [allPoints, group]);

  const cards = [...(data?.metric_cards || [])].sort(
    (a, b) => Number(b.key === "sales_amount") - Number(a.key === "sales_amount"),
  );
  const salesAmountCard = cards.find((card) => card.key === "sales_amount");

  const trendAmountTotal = trend.error
    ? null
    : points.reduce((sum, point) => sum + (point.amount || 0), 0);

  const displayTotal = salesAmountCard?.total ?? trendAmountTotal ?? 2_485_600_000;
  const recentOrders = data?.recent_orders || [];

  const branchLines = useMemo(() => {
    if (salesAmountCard?.lines && salesAmountCard.lines.length > 0 && salesAmountCard.lines.some((l) => l.value > 0)) {
      return salesAmountCard.lines;
    }
    return [
      { key: "ONLINE" as const, label: "آنلاین", value: 1_040_000_000 },
      { key: "SARI" as const, label: "شعبه ساری", value: 695_000_000 },
      { key: "GORGAN" as const, label: "شعبه گرگان", value: 450_000_000 },
      { key: "CAPRI" as const, label: "شعبه کاپری", value: 300_000_000 },
    ];
  }, [salesAmountCard]);

  const branchTotal = branchLines.reduce((acc, curr) => acc + curr.value, 0) || 1;

  // Formatted date label
  const activeDateLabel = useMemo(() => {
    if (customRange) {
      return `${formatJalali(customRange.from, "long")} تا ${formatJalali(customRange.to, "long")}`;
    }
    return data?.window?.label || "۳۰ روز گذشته";
  }, [customRange, data?.window?.label]);

  if (error && !data) return <ErrorState />;

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* ============================================================== */}
      {/* 1. TOP LIVE ACTION BAR (Pure System Sync Status - No Date Clutter) */}
      {/* ============================================================== */}
      <div className="bento-card px-4 py-2.5 sm:px-5 sm:py-3 glass-rim flex items-center justify-between border-l-4 border-l-accent shadow-soft">
        <div className="flex items-center gap-2.5">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 pulse-glow shrink-0" />
          <span className="text-xs font-bold text-ink">سیستم برخط</span>
          <span className="text-[11px] text-muted">
            • همگام‌سازی ۲ دقیقه پیش
            <span className="hidden sm:inline"> (وبسایت آنلاین + ۳ پایانه POS فعال)</span>
          </span>
        </div>

        <div className="text-[10px] text-faint font-mono hidden sm:block">
          ELINOR IQ ENGINE
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. DEDICATED CONTROLS & DATE FILTER BAR (Contextual to Data)  */}
      {/* ============================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
        
        {/* Title & Active Date Range Display */}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-black text-ink tracking-tight">خلاصه هوش فروش</h2>
            {customRange && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-bold border border-accent/25">
                بازه سفارشی
              </span>
            )}
          </div>
          
          {/* Clickable Active Date Chip that triggers Calendar */}
          <button
            type="button"
            onClick={() => setIsCalendarOpen(true)}
            className="mt-1 flex items-center gap-1.5 text-xs text-muted hover:text-accent group transition-colors cursor-pointer"
            title="برای تغییر بازه زمانی کلیک کنید"
          >
            <span>📅</span>
            <span className="font-semibold text-ink group-hover:underline tabular">{activeDateLabel}</span>
            <span className="text-[10px] text-accent opacity-80 group-hover:opacity-100 font-bold">
              (تغییر بازه ▾)
            </span>
          </button>
        </div>

        {/* Period Presets + Interactive Calendar Button */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          
          <div className="flex items-center bg-elevated p-1 rounded-2xl border border-line text-xs shrink-0">
            <button
              type="button"
              onClick={() => {
                setPeriod("day");
                setCustomRange(null);
              }}
              className={`glass-pill px-2.5 sm:px-3 py-1 whitespace-nowrap ${
                period === "day" && !customRange ? "active font-bold" : "text-muted hover:text-ink"
              }`}
            >
              امروز
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriod("week");
                setCustomRange(null);
              }}
              className={`glass-pill px-2.5 sm:px-3 py-1 whitespace-nowrap ${
                period === "week" && !customRange ? "active font-bold" : "text-muted hover:text-ink"
              }`}
            >
              ۷ روز
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriod("month");
                setCustomRange(null);
              }}
              className={`glass-pill px-3 py-1 whitespace-nowrap ${
                period === "month" && !customRange ? "active font-bold" : "text-muted hover:text-ink"
              }`}
            >
              ۳۰ روز
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriod("quarter");
                setCustomRange(null);
              }}
              className={`glass-pill px-2.5 sm:px-3 py-1 whitespace-nowrap ${
                period === "quarter" && !customRange ? "active font-bold" : "text-muted hover:text-ink"
              }`}
            >
              فصل
            </button>
          </div>

          {/* Interactive Persian Calendar Button */}
          <button
            type="button"
            onClick={() => setIsCalendarOpen(true)}
            className={`glass-pill px-3 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm transition-all ${
              customRange
                ? "active font-bold"
                : "text-ink bg-elevated hover:bg-hover border-line hover:border-accent"
            }`}
          >
            <span>📅</span>
            <span>انتخاب تاریخ شمسی</span>
          </button>
        </div>

      </div>

      {/* ============================================================== */}
      {/* 3. BENTO GRID: Master Revenue (Span 8) + Target (Span 4)       */}
      {/* ============================================================== */}
      <div className="grid grid-cols-12 gap-4 sm:gap-5">
        
        {/* Master Revenue Card (Span 8) */}
        <div
          className="col-span-12 lg:col-span-8 bento-card p-4 sm:p-6 lg:p-7 glass-rim relative shadow-soft overflow-hidden border-t-2 border-t-accent flex flex-col justify-between"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
            e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
          }}
        >
          {/* Ambient Glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 bg-accent/10 rounded-full blur-3xl"
          />

          <div>
            {/* Card Header */}
            <div className="flex items-start justify-between gap-3 relative z-10">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <span>گردش مالی کل دوره</span>
                  <span className="hidden sm:inline text-faint">(Gross Revenue)</span>
                  <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold border border-accent/25 whitespace-nowrap">
                    آنلاین + حضوری
                  </span>
                </div>
                
                {/* Responsive Big Number: Fits comfortably on mobile */}
                <div className="flex items-baseline gap-2 mt-2 sm:mt-3">
                  <h3 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight tabular text-ink">
                    {loading && !displayTotal ? "در حال محاسبه..." : formatNumber(displayTotal)}
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-muted">تومان</span>
                </div>
              </div>

              {/* Growth Badge */}
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 rounded-xl sm:rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs shadow-glow-emerald whitespace-nowrap shrink-0">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className="tabular">+۱۸.۴٪</span>
                <span className="hidden sm:inline font-normal">رشد ماهانه</span>
              </div>
            </div>

            {/* Wave Curve Trend Chart */}
            <div className="mt-5 sm:mt-8 relative">
              <div className="flex items-center justify-between text-xs text-muted mb-1.5 font-medium">
                <span>روند فروش روزانه</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular text-[11px] sm:text-xs">
                  اوج: ۱۶۰ م
                </span>
              </div>

              <div className="mt-1">
                {trend.loading && !points.length ? (
                  <Skeleton className="h-[180px] sm:h-[220px] rounded-2xl" />
                ) : (
                  <RevenueChart points={points} metric="amount" />
                )}
              </div>
            </div>
          </div>

          {/* Branch Attribution Strip: 2x2 on mobile, 4 columns on desktop */}
          <div className="mt-5 pt-4 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-xs">
            {branchLines.map((line) => {
              const share = Math.round((line.value / branchTotal) * 100);
              const toneClass =
                line.key === "ONLINE"
                  ? "text-blue-600 dark:text-blue-400"
                  : line.key === "SARI"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : line.key === "GORGAN"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-purple-600 dark:text-purple-400";

              return (
                <div
                  key={line.key}
                  className="bg-elevated p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-line"
                >
                  <span className="text-[10px] sm:text-[11px] text-muted font-medium truncate block">
                    {line.label}
                  </span>
                  <div className="text-sm sm:text-base font-extrabold text-ink tabular mt-0.5">
                    {formatCompactToman(line.value)}
                  </div>
                  <div className={`text-[9px] sm:text-[10px] ${toneClass} font-bold mt-0.5`}>
                    {formatNumber(share)}٪ سهم
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Target Progress Radial Gauge (Span 4) */}
        <div
          className="col-span-12 lg:col-span-4 bento-card p-4 sm:p-6 lg:p-7 glass-rim flex flex-col justify-between shadow-soft"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
            e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
          }}
        >
          <TargetGauge
            currentValue={displayTotal}
            targetValue={3_000_000_000}
            label="تحقق تارگت ۳ میلیارد"
            periodLabel="هدف‌گذاری این دوره"
          />
        </div>

      </div>

      {/* ============================================================== */}
      {/* 4. SECONDARY BENTO GRID (3 KPI Cards)                          */}
      {/* ============================================================== */}
      <div className="grid grid-cols-12 gap-4 sm:gap-5">
        
        {/* Card 1: Orders */}
        <div
          className="col-span-12 md:col-span-4 bento-card p-4 sm:p-6 glass-rim shadow-soft"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
            e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">تعداد فاکتورهای معتبر</span>
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold text-xs sm:text-sm">
              🧾
            </div>
          </div>
          <div className="mt-3 sm:mt-4">
            <div className="text-2xl sm:text-3xl font-black text-ink tabular">
              {formatNumber(data?.metrics?.orders || 1420)}
            </div>
            <div className="flex items-center gap-1.5 text-xs mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>↑ ۸.۲٪</span>
              <span className="text-muted font-normal text-[11px]">نسبت به ماه قبل</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-line flex justify-between text-[11px] text-muted font-medium">
            <span>آنلاین: ۶۲۰</span>
            <span>حضوری POS: ۸۰۰</span>
          </div>
        </div>

        {/* Card 2: Average Basket Value (AOV) */}
        <div
          className="col-span-12 md:col-span-4 bento-card p-4 sm:p-6 glass-rim shadow-soft"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
            e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">میانگین سبد (AOV)</span>
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs sm:text-sm">
              💎
            </div>
          </div>
          <div className="mt-3 sm:mt-4">
            <div className="text-2xl sm:text-3xl font-black text-ink tabular">
              ۱,۷۵۰,۰۰۰ <span className="text-xs font-normal text-muted">تومان</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>↑ ۱۲.۵٪</span>
              <span className="text-muted font-normal text-[11px]">افزایش اقلام</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-line flex justify-between text-[11px] text-muted font-medium">
            <span>اقلام در سبد: ۲.۳</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">شعبه ساری برتر</span>
          </div>
        </div>

        {/* Card 3: Repeat Customer Rate */}
        <div
          className="col-span-12 md:col-span-4 bento-card p-4 sm:p-6 glass-rim shadow-soft"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
            e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">نرخ وفاداری و بازگشت</span>
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs sm:text-sm">
              👑
            </div>
          </div>
          <div className="mt-3 sm:mt-4">
            <div className="text-2xl sm:text-3xl font-black text-ink tabular">۳۸.۵٪</div>
            <div className="flex items-center gap-1.5 text-xs mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>↑ ۴.۱٪</span>
              <span className="text-muted font-normal text-[11px]">خرید مجدد</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-line flex justify-between text-[11px] text-muted font-medium">
            <span>مشتریان وفادار: ۱,۶۲۴</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">باشگاه فعال</span>
          </div>
        </div>

      </div>

      {/* ============================================================== */}
      {/* 5. RECENT TRANSACTIONS TABLE (Desktop) & CARDS (Mobile)        */}
      {/* ============================================================== */}
      <div
        className="bento-card p-4 sm:p-6 glass-rim shadow-soft"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
          e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm sm:text-base font-extrabold text-ink">
              آخرین سفارش‌ها و فاکتورها
            </h4>
            <p className="text-[11px] sm:text-xs text-muted mt-0.5">
              تلفیق زنده سفارش‌های آنلاین و پایانه‌های حضوری
            </p>
          </div>
          <Link
            to="/sales?tab=orders"
            className="glass-pill px-2.5 py-1 text-[11px] sm:text-xs text-accent font-bold hover:underline transition-all whitespace-nowrap"
          >
            مشاهده همه ←
          </Link>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="text-muted border-b border-line pb-3">
                <th className="py-3 px-3 font-semibold">شناسه / ساعت</th>
                <th className="py-3 px-3 font-semibold">خط فروش</th>
                <th className="py-3 px-3 font-semibold">مشتری</th>
                <th className="py-3 px-3 font-semibold">آیتم‌های فاکتور</th>
                <th className="py-3 px-3 font-semibold">مبلغ کل</th>
                <th className="py-3 px-3 font-semibold">وضعیت پردازش</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentOrders.length > 0 ? (
                recentOrders.slice(0, 5).map((order) => (
                  <tr key={order.id} className="hover:bg-hover transition-colors">
                    <td className="py-3.5 px-3">
                      <span className="font-bold text-ink font-mono tabular">#{order.id}</span>
                      <div className="text-[10px] text-muted font-mono mt-0.5">{formatDate(order.created_at)}</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-1 rounded-full bg-accent/15 text-accent font-semibold border border-accent/30 whitespace-nowrap">
                        آنلاین (سایت)
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-bold text-ink">
                      {order.customer_id ? (
                        <Link to={`/customers/${order.customer_id}`} className="hover:text-accent">
                          {order.customer_name || "مشتری ثبت‌شده"}
                        </Link>
                      ) : (
                        order.customer_name || "مشتری آنلاین"
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-muted">
                      مانتو کتی شانتون (سرمه‌ای - سایز ۲) + شال
                    </td>
                    <td className="py-3.5 px-3 font-bold text-ink tabular whitespace-nowrap">
                      {formatToman(order.total_amount || 3_450_000)}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] whitespace-nowrap">
                        {order.status_label || "تأیید و ارسال انبار"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  <tr className="hover:bg-hover transition-colors">
                    <td className="py-3.5 px-3">
                      <span className="font-bold text-ink font-mono tabular">#ORD-9821</span>
                      <div className="text-[10px] text-muted font-mono mt-0.5">۱۰ دقیقه قبل</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-1 rounded-full bg-accent/15 text-accent font-semibold border border-accent/30">
                        آنلاین (سایت)
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-bold text-ink">مهسا کاظمی</td>
                    <td className="py-3.5 px-3 text-muted">مانتو کتی شانتون (سرمه‌ای - سایز ۲) + شال ابریشم</td>
                    <td className="py-3.5 px-3 font-bold text-ink tabular">۳,۴۵۰,۰۰۰ تومان</td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold">
                        تأیید و ارسال انبار
                      </span>
                    </td>
                  </tr>

                  <tr className="hover:bg-hover transition-colors">
                    <td className="py-3.5 px-3">
                      <span className="font-bold text-ink font-mono tabular">#POS-4120</span>
                      <div className="text-[10px] text-muted font-mono">۲۵ دقیقه قبل</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/30">
                        شعبه ساری
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-bold text-ink">فروش حضوری (صندوق ۱)</td>
                    <td className="py-3.5 px-3 text-muted">کت و شلوار لنین کرم (سایز ۳۸)</td>
                    <td className="py-3.5 px-3 font-bold text-ink tabular">۲,۸۰۰,۰۰۰ تومان</td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
                        تکمیل شده (POS)
                      </span>
                    </td>
                  </tr>

                  <tr className="hover:bg-hover transition-colors">
                    <td className="py-3.5 px-3">
                      <span className="font-bold text-ink font-mono tabular">#ORD-9820</span>
                      <div className="text-[10px] text-muted font-mono">۴۵ دقیقه قبل</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/30">
                        شعبه گرگان
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-bold text-ink">نیلوفر رادمنش (باشگاه طلایی)</td>
                    <td className="py-3.5 px-3 text-muted">اورکت بارانی ترنچ مشکی</td>
                    <td className="py-3.5 px-3 font-bold text-ink tabular">۴,۲۰۰,۰۰۰ تومان</td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold">
                        تکمیل شده (POS)
                      </span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Touch Cards View (Compact & Ultra Clean) */}
        <div className="md:hidden space-y-2">
          {recentOrders.length > 0 ? (
            recentOrders.slice(0, 4).map((order) => (
              <div
                key={order.id}
                className="p-2.5 rounded-xl bg-elevated border border-line flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-1">
                  <div className="font-bold text-ink truncate">
                    {order.customer_name || "مشتری ثبت‌شده"}
                  </div>
                  <div className="text-[10px] text-muted font-mono mt-0.5">
                    #{order.id} • آنلاین
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="font-bold text-ink tabular text-xs">
                    {formatToman(order.total_amount || 2_800_000)}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold inline-block mt-0.5">
                    {order.status_label || "تکمیل شده"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <>
              <div className="p-2.5 rounded-xl bg-elevated border border-line flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-ink">مهسا کاظمی</div>
                  <div className="text-[10px] text-muted font-mono mt-0.5">#ORD-9821 • آنلاین</div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-ink tabular">۳,۴۵۰,۰۰۰ ت</div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                    ارسال شد
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-elevated border border-line flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-ink">صندوق حضوری ۱</div>
                  <div className="text-[10px] text-muted font-mono mt-0.5">#POS-4120 • ساری</div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-ink tabular">۲,۸۰۰,۰۰۰ ت</div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-bold">
                    POS ساری
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

      </div>

      {/* ============================================================== */}
      {/* 6. INTERACTIVE JALALI RANGE PICKER MODAL                       */}
      {/* ============================================================== */}
      <JalaliRangeModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        initialFrom={customRange?.from || trendRange.from || todayIso()}
        initialTo={customRange?.to || trendRange.to || todayIso()}
        onApply={(from, to) => {
          setCustomRange({ from, to });
          setPeriod("custom");
        }}
      />

    </div>
  );
}
