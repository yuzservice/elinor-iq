import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { formatDate, formatMobile, formatNumber, formatToman } from "../../lib/format";
import {
  campaignsService,
  type CampaignItem,
  type CampaignReportParams,
  type CustomerRedemption,
} from "../../services/campaigns";
import { EmptyState, ErrorState, Skeleton } from "../../components/Table";

const BRANCH_OPTIONS = [
  { value: "", label: "همه شعب" },
  { value: "SARI", label: "شعبه ساری" },
  { value: "GORGAN", label: "شعبه گرگان" },
  { value: "CAPRI", label: "شعبه کاپری" },
  { value: "ONLINE", label: "وب‌سایت آنلاین" },
] as const;

const LINE_COLORS: Record<string, string> = {
  ONLINE: "bg-accent",
  SARI: "bg-emerald-500",
  GORGAN: "bg-amber-500",
  CAPRI: "bg-purple-500",
};

export function CustomerCampaignsPanel() {
  const [selectedActionId, setSelectedActionId] = useState<number | undefined>(undefined);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);

  const queryParams: CampaignReportParams = useMemo(
    () => ({
      action_id: selectedActionId,
      branch: selectedBranch || undefined,
      page,
      per_page: 20,
    }),
    [selectedActionId, selectedBranch, page],
  );

  const { data, loading, error } = useApi(
    () => campaignsService.getReport(queryParams),
    [queryParams, retry],
  );

  const filteredRedemptions = useMemo(() => {
    if (!data?.redemptions) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.redemptions;
    return data.redemptions.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_mobile.includes(q) ||
        r.tracking_code.toLowerCase().includes(q) ||
        String(r.source_id).includes(q),
    );
  }, [data?.redemptions, search]);

  const summary = data?.summary;
  const currentCampaign = data?.selected_campaign || data?.campaigns?.[0];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ============================================================== */}
      {/* 1. HEADER ROW & CAMPAIGN SELECTOR                              */}
      {/* ============================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-ink">
              گزارش کمپین‌ها و هدایای کیف پول
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/25">
              فعال و برخط
            </span>
          </div>
          <p className="text-xs text-muted mt-1 leading-5">
            رصد و تحلیل کمپین‌های شارژ هدیه کیف پول، نرخ مصرف، فروش ایجادشده و رفتار خرید مشتریان
          </p>
        </div>

        {/* Campaign Dropdown Switcher */}
        {data?.campaigns && data.campaigns.length > 0 && (
          <div className="flex items-center gap-2 bg-elevated border border-line rounded-2xl px-3 py-2 text-xs">
            <span className="text-muted font-medium shrink-0">انتخاب کمپین:</span>
            <select
              aria-label="انتخاب کمپین باشگاه مشتریان"
              value={selectedActionId ?? currentCampaign?.id ?? ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : undefined;
                setSelectedActionId(val);
                setPage(1);
              }}
              className="bg-transparent text-ink font-bold text-xs focus:outline-none cursor-pointer"
            >
              {data.campaigns.map((c: CampaignItem) => (
                <option key={c.id} value={c.id} className="bg-surface text-ink">
                  {c.title} ({formatToman(c.type_value)})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 2. SELECTED CAMPAIGN BANNER                                    */}
      {/* ============================================================== */}
      {currentCampaign && (
        <div className="bento-card p-4 sm:p-5 glass-rim shadow-soft border-r-4 border-r-accent space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🎁</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-ink">{currentCampaign.title}</h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      currentCampaign.is_active
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                        : "bg-elevated text-muted border border-line"
                    }`}
                  >
                    {currentCampaign.is_active ? "در حال اجرا" : "پایان‌یافته"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted mt-0.5">
                  <span>نوع: {currentCampaign.type_label}</span>
                  <span className="text-faint">•</span>
                  <span>
                    مبلغ هدیه: <strong className="text-accent">{formatToman(currentCampaign.type_value)}</strong>
                  </span>
                  {currentCampaign.level_title && (
                    <>
                      <span className="text-faint">•</span>
                      <span>جامعه هدف: {currentCampaign.level_title}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="text-left text-xs bg-elevated/70 p-2.5 rounded-xl border border-line">
              <span className="text-[10px] text-muted block">بازه زمانی اعتبار</span>
              <span className="font-bold text-ink font-mono text-[11px]">
                {currentCampaign.start_date ? formatDate(currentCampaign.start_date) : "—"} تا{" "}
                {currentCampaign.end_date ? formatDate(currentCampaign.end_date) : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. 4 BENTO KPI SUMMARY CARDS                                   */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bento-card p-4 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">مجموع هدیه اعطاشده</span>
            <div className="h-7 w-7 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold text-xs">
              💰
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-ink tabular">
              {formatNumber(summary?.total_gift_distributed || 0)}{" "}
              <span className="text-xs font-normal text-muted">تومان</span>
            </div>
            <div className="text-[11px] text-muted mt-1">
              تخمین ~{formatNumber(currentCampaign?.target_audience_estimate || 450)} مشتری مشمول
            </div>
          </div>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">کل اعتبار مصرف‌شده</span>
            <div className="h-7 w-7 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
              🛍️
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular">
              {formatNumber(summary?.total_gift_used || 0)}{" "}
              <span className="text-xs font-normal text-muted">تومان</span>
            </div>
            <div className="text-[11px] text-muted mt-1">
              در قالب <strong className="text-ink tabular">{formatNumber(summary?.redemption_count || 0)}</strong> فاکتور خرید
            </div>
          </div>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">نرخ مصرف هدیه (Burn Rate)</span>
            <div className="h-7 w-7 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
              🔥
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-ink tabular">
              {summary?.burn_rate_pct ?? 0}٪
            </div>
            <div className="text-[11px] text-muted mt-1">
              توسط <strong className="text-ink tabular">{formatNumber(summary?.unique_customers_count || 0)}</strong> مشتری خریدار
            </div>
          </div>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">فروش جذب‌شده (Attributed Sales)</span>
            <div className="h-7 w-7 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs">
              📈
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 tabular">
              {formatNumber(summary?.total_sales_generated || 0)}{" "}
              <span className="text-xs font-normal text-muted">تومان</span>
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
              +{formatNumber(summary?.basket_lift || 0)} تومان سود مازاد سبد خرید
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. BRANCH DISTRIBUTION PROGRESS & CARDS                       */}
      {/* ============================================================== */}
      {summary?.branches && summary.branches.length > 0 && (
        <div className="bento-card p-4 sm:p-5 glass-rim shadow-soft space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-bold">توزیع مصرف اعتبار هدیه بین شعب فروش</span>
            <span className="text-[11px] text-muted">
              کل هدیه مصرف‌شده: <strong className="text-ink tabular">{formatToman(summary.total_gift_used)}</strong>
            </span>
          </div>

          {/* Progress Bar */}
          {summary.total_gift_used > 0 && (
            <div className="h-2.5 w-full rounded-full bg-elevated overflow-hidden flex border border-line/60">
              {summary.branches.map((b) => {
                if (b.share_pct <= 0) return null;
                return (
                  <div
                    key={b.key}
                    style={{ width: `${b.share_pct}%` }}
                    className={LINE_COLORS[b.key] || "bg-accent"}
                    title={`${b.label}: ${formatNumber(b.wallet_amount)} تومان (${b.share_pct}%)`}
                  />
                );
              })}
            </div>
          )}

          {/* 4 Branch Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            {summary.branches.map((b) => (
              <div key={b.key} className="bg-elevated/70 border border-line rounded-xl p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">{b.label}</span>
                  <span className="text-[10px] font-bold text-accent tabular">{b.share_pct}٪</span>
                </div>
                <div className="text-sm font-black text-ink tabular">{formatNumber(b.wallet_amount)} تومان</div>
                <div className="text-[10px] text-muted">{formatNumber(b.count)} فاکتور ثبت‌شده</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. CUSTOMER REDEMPTIONS TABLE & TOUCH CARDS                   */}
      {/* ============================================================== */}
      <div className="bento-card p-4 sm:p-6 glass-rim shadow-soft space-y-4">
        {/* Table Filter & Search Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-ink">ریز مشتریان استفاده‌کننده از هدیه</h3>
            <p className="text-[11px] text-muted mt-0.5">
              لیست فاکتورها، میزان استفاده از هدیه کیف پول و سود مازاد خرید نقدی مشتری
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Filter Pills */}
            <div className="flex items-center bg-elevated p-0.5 rounded-xl border border-line text-[11px] overflow-x-auto no-scrollbar">
              {BRANCH_OPTIONS.map((br) => {
                const active = selectedBranch === br.value;
                return (
                  <button
                    key={br.value}
                    type="button"
                    onClick={() => {
                      setSelectedBranch(br.value);
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                      active
                        ? "bg-surface text-ink font-bold shadow-xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {br.label}
                  </button>
                );
              })}
            </div>

            {/* Quick Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام یا موبایل..."
              className="px-3 py-1.5 rounded-xl bg-elevated border border-line text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent w-36 sm:w-44"
            />
          </div>
        </div>

        {/* Content State */}
        {loading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : error && !data ? (
          <ErrorState onRetry={() => setRetry((v) => v + 1)} />
        ) : filteredRedemptions.length === 0 ? (
          <EmptyState
            title="فاکتوری برای این کمپین یافت نشد."
            body="هنوز تراکنشی با استفاده از اعتبار هدیه کیف پول در این بازه ثبت نشده است."
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="text-muted border-b border-line font-semibold">
                    <th className="py-2.5 px-3">نام مشتری</th>
                    <th className="py-2.5 px-3">شماره تماس</th>
                    <th className="py-2.5 px-3">شعبه خرید</th>
                    <th className="py-2.5 px-3">تاریخ فاکتور</th>
                    <th className="py-2.5 px-3">مبلغ مصرف هدیه</th>
                    <th className="py-2.5 px-3">مبلغ کل فاکتور</th>
                    <th className="py-2.5 px-3">سود مازاد سبد (Lift)</th>
                    <th className="py-2.5 px-3 text-center">شناسنامه ۳۶۰</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredRedemptions.map((row: CustomerRedemption) => (
                    <tr key={row.id} className="hover:bg-hover transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-ink">{row.customer_name}</div>
                        {row.tracking_code && (
                          <div className="text-[10px] text-muted font-mono">پیگیری: #{row.tracking_code}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono tabular text-muted ltr-iso">
                        {row.customer_mobile ? formatMobile(row.customer_mobile) : "—"}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-elevated border border-line text-ink text-[11px] font-semibold">
                          {row.sales_line_label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-muted font-mono">{formatDate(row.created_at)}</td>
                      <td className="py-3 px-3 font-black text-accent tabular">
                        {formatToman(row.wallet_amount)}
                      </td>
                      <td className="py-3 px-3 font-bold text-ink tabular">{formatToman(row.total_amount)}</td>
                      <td className="py-3 px-3 font-bold text-emerald-600 dark:text-emerald-400 tabular">
                        +{formatToman(row.incremental_amount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {row.customer_id ? (
                          <Link
                            to={`/customers/${row.customer_id}`}
                            className="px-2.5 py-1 rounded-lg bg-accent/10 hover:bg-accent text-accent hover:text-on-accent text-[11px] font-bold transition-all inline-flex items-center gap-1"
                          >
                            <span>مشاهده</span>
                            <span>←</span>
                          </Link>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch Cards View */}
            <div className="md:hidden space-y-2.5">
              {filteredRedemptions.map((row: CustomerRedemption) => (
                <div key={row.id} className="bento-card p-3 glass-rim shadow-sm space-y-2 text-xs border-r-3 border-r-accent">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-ink">{row.customer_name}</div>
                      <div className="text-[10px] text-muted font-mono ltr-iso">
                        {row.customer_mobile ? formatMobile(row.customer_mobile) : "—"}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-elevated border border-line text-ink font-semibold">
                      {row.sales_line_label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line text-[11px]">
                    <div>
                      <span className="text-[10px] text-muted block">مصرف هدیه:</span>
                      <span className="font-bold text-accent tabular">{formatToman(row.wallet_amount)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block">مجموع فاکتور (Lift):</span>
                      <span className="font-bold text-ink tabular">{formatToman(row.total_amount)}</span>{" "}
                      <span className="text-emerald-600 text-[10px] font-bold">(+{formatNumber(row.incremental_amount)})</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-line text-[11px]">
                    <span className="text-muted font-mono text-[10px]">{formatDate(row.created_at)}</span>
                    {row.customer_id && (
                      <Link
                        to={`/customers/${row.customer_id}`}
                        className="px-2 py-0.5 rounded-md bg-accent text-on-accent font-bold text-[10px]"
                      >
                        شناسنامه ۳۶۰ ←
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {data && data.pagination && data.pagination.total_pages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-line text-xs text-muted">
                <div>
                  صفحه {formatNumber(page)} از {formatNumber(data.pagination.total_pages)} (کل:{" "}
                  {formatNumber(data.pagination.total)} فاکتور)
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1 rounded-xl bg-elevated border border-line text-ink disabled:opacity-40"
                  >
                    قبلی
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(data.pagination.total_pages, p + 1))}
                    disabled={page >= data.pagination.total_pages}
                    className="px-3 py-1 rounded-xl bg-elevated border border-line text-ink disabled:opacity-40"
                  >
                    بعدی
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============================================================== */}
      {/* 6. 4 SMART STRATEGIC RECOMMENDATION CARDS                     */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
        <div className="bento-card p-4 glass-rim shadow-soft space-y-1.5 border-r-3 border-r-purple-500">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <h4 className="font-extrabold text-ink">تحلیل ارزش افزوده سبد خرید (Basket Lift)</h4>
          </div>
          <p className="text-muted leading-5 text-[11px]">
            مشتریان به ازای هر ۳۰۰ هزار تومان اعتبار هدیه، به طور میانگین چند برابر مبلغ هدیه خرید نقدی انجام داده‌اند؛ این شاخص نشان‌دهنده اثربخشی مستقیم کمپین در تزریق نقدینگی به بوتیک است.
          </p>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft space-y-1.5 border-r-3 border-r-amber-500">
          <div className="flex items-center gap-2">
            <span className="text-base">⏰</span>
            <h4 className="font-extrabold text-ink">هشدار مشتریان در آستانه انقضای هدیه</h4>
          </div>
          <p className="text-muted leading-5 text-[11px]">
            مشتریانی که هنوز از اعتبار ۳۰۰ هزار تومانی خود استفاده نکرده‌اند را می‌توان در ۴۸ ساعت پایانی با پیامک یادآوری هوشمند مورد هدف قرار داد تا نرخ مصرف (Burn Rate) به بیش از ۶۰٪ برسد.
          </p>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft space-y-1.5 border-r-3 border-r-emerald-500">
          <div className="flex items-center gap-2">
            <span className="text-base">🏬</span>
            <h4 className="font-extrabold text-ink">انگیزه مراجعه به شعب حضوری</h4>
          </div>
          <p className="text-muted leading-5 text-[11px]">
            بیشترین سهم مصرف هدیه در شعب حضوری ساری و گرگان ثبت شده است که نشان می‌دهد هدایای کیف پول بهترین ابزار برای بازگرداندن مشتریان باشگاه به ویترین و اتاق پرو شعب هستند.
          </p>
        </div>

        <div className="bento-card p-4 glass-rim shadow-soft space-y-1.5 border-r-3 border-r-blue-500">
          <div className="flex items-center gap-2">
            <span className="text-base">💳</span>
            <h4 className="font-extrabold text-ink">ترکیب با پرداخت اقساطی (اسنپ‌پی / دیجی‌پی)</h4>
          </div>
          <p className="text-muted leading-5 text-[11px]">
            بسیاری از مشتریان اعتبار هدیه را به عنوان پیش‌پرداخت خرید اقساطی استفاده می‌کنند؛ این رفتار امکان افزایش سقف خرید مشتری تا فاکتورهای چندمیلیونی را فراهم می‌کند.
          </p>
        </div>
      </div>
    </div>
  );
}
