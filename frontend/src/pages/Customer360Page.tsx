import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, CustomerNameCell, Pagination, StatusBadge } from "../components/ui";
import { EmptyState, ErrorState, Skeleton } from "../components/Table";
import { joinFacts, profileValue, salesLineTone } from "../features/customers/customer360Display";
import { useApi } from "../hooks/useApi";
import { useTiers } from "../hooks/useTiers";
import { TierBadge } from "../features/customers/tierDisplay";
import { INCOMPLETE_LABEL, customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatDateLong, formatMobile, formatNumber, formatToman } from "../lib/format";
import { customersService } from "../services/customers";
import type { Customer360, CustomerProductHistory, CustomerPurchase } from "../types";

type TabKey = "purchases" | "products" | "profile" | "addresses" | "discounts";
type PurchaseKindFilter = "all" | "online" | "pos" | "cancelled";

function getInitials(name: string) {
  if (!name || name === "مشتری بدون نام") return "EL";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getTierPill(data: Customer360, summary?: string) {
  if (data.is_operator) {
    return (
      <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-xs border border-amber-500/30">
        {data.operator_label || "اپراتور"}
      </span>
    );
  }
  if (!data.tier_code) return null;
  return (
    <span title={summary}>
      <TierBadge code={data.tier_code} label={data.tier_label} channelLabel={data.tier_channel_label} className="px-3 text-xs" />
    </span>
  );
}

const LINE_COLORS: Record<string, string> = {
  ONLINE: "bg-accent",
  SARI: "bg-emerald-500",
  GORGAN: "bg-amber-500",
  CAPRI: "bg-purple-500",
};

export function Customer360Page() {
  const { id } = useParams();
  const { tiers } = useTiers();
  const [tab, setTab] = useState<TabKey>("purchases");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [purchaseFilter, setPurchaseFilter] = useState<PurchaseKindFilter>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<Customer360["purchases"] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [products, setProducts] = useState<CustomerProductHistory[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(false);
  const [productRetry, setProductRetry] = useState(0);
  const { data, loading, error } = useApi(() => customersService.detail(Number(id)), [id]);

  useEffect(() => {
    setTab("purchases");
    setOpenKey(null);
    setPurchaseFilter("all");
    setHistoryPage(1);
    setHistory(null);
    setProducts(null);
    setProductsError(false);
    setProductRetry(0);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (historyPage === 1) {
      if (data?.purchases) setHistory(data.purchases);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    customersService
      .purchases(Number(id), historyPage)
      .then((payload) => {
        if (!cancelled) setHistory(payload);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, historyPage, data]);

  useEffect(() => {
    if (!id || tab !== "products") return;
    if (products && !productsError) return;
    let cancelled = false;
    setProductsLoading(true);
    setProductsError(false);
    customersService
      .products(Number(id))
      .then((payload) => {
        if (!cancelled) setProducts(payload.results);
      })
      .catch(() => {
        if (!cancelled) setProductsError(true);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, tab, productRetry, products, productsError]);

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-52 rounded-xl" />
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    );
  }
  if (error || !data) return <ErrorState />;

  const display = customerDisplayName(data);
  const purchases = history || data.purchases;
  const initials = getInitials(display.name);
  const totalSalesLinePurchases = data.sales_lines.reduce((acc, item) => acc + (item.purchase_count || 0), 0);

  const tabs: ReadonlyArray<{ key: TabKey; label: string; count?: number }> = [
    { key: "purchases", label: "سوابق خرید و فاکتورها", count: purchases.total },
    { key: "products", label: "کمد لباس و کالاها", count: products ? products.length : undefined },
    { key: "profile", label: "مشخصات هویتی" },
    { key: "addresses", label: "نشانی‌ها", count: data.addresses.length },
    { key: "discounts", label: "تخفیف‌ها", count: data.discounts.length },
  ];

  return (
    <div className="space-y-5">
      {/* ============================================================== */}
      {/* 1. MINIMAL BREADCRUMB & QUICK NAVIGATION                       */}
      {/* ============================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-muted">
          <Link
            to="/customers?tab=list"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-elevated border border-line text-ink hover:border-accent transition-colors font-semibold"
          >
            <span>→</span>
            <span>بازگشت به لیست مشتریان</span>
          </Link>
          <span className="text-faint">/</span>
          <span className="text-ink font-bold truncate max-w-[200px] sm:max-w-none">{display.name}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-xl bg-elevated border border-line text-muted font-mono text-[11px] ltr-iso">
            #EL-{data.id}
          </span>
          <Badge tone={data.status_label === "فعال" ? "sage" : "neutral"}>
            {data.status_label || "وضعیت ثبت نشده"}
          </Badge>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. HERO 360 IDENTITY & OMNICHANNEL BENTO CARD                  */}
      {/* ============================================================== */}
      <section className="bento-card p-5 sm:p-6 glass-rim shadow-soft space-y-5">
        {/* Top Row: Avatar, Identity, Badges & Quick Contact/Dates */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-tr from-accent to-indigo-600 flex items-center justify-center font-black text-white text-lg sm:text-xl shadow-md shrink-0">
              {initials}
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink">
                  <CustomerNameCell name={display.name} fallback={display.fallback} sourceId={data.id} />
                </h1>
                {getTierPill(data, tiers.find((tier) => tier.code === data.tier_code)?.summary)}
                {data.is_operator ? (
                  <Badge tone="warning">{data.operator_label}</Badge>
                ) : (
                  <Badge tone={data.is_purchasing ? "sage" : "neutral"}>{data.purchase_behavior_label}</Badge>
                )}
                {data.channel !== "none" ? <Badge tone="accent">{data.channel_label}</Badge> : null}
                {data.incomplete ? <Badge tone="warning">{INCOMPLETE_LABEL}</Badge> : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="font-mono font-semibold text-ink ltr-iso">
                  {data.mobile ? formatMobile(data.mobile) : INCOMPLETE_LABEL}
                </span>
                {data.email && (
                  <>
                    <span className="text-faint">•</span>
                    <span className="ltr-iso">{data.email}</span>
                  </>
                )}
                {data.profile.birth_date && (
                  <>
                    <span className="text-faint">•</span>
                    <span>
                      زادروز: <strong className="text-ink">{formatDate(data.profile.birth_date)}</strong>
                    </span>
                  </>
                )}
                {data.addresses?.[0]?.city && (
                  <>
                    <span className="text-faint">•</span>
                    <span>{data.addresses[0].city}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Pill Box: First & Last Purchase Timestamps */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 bg-elevated p-3 rounded-2xl border border-line text-xs shrink-0">
            <div className="px-2 sm:px-3 border-l border-line">
              <span className="text-[10px] text-muted block">اولین خرید ثبت‌شده</span>
              <span className="font-bold text-ink tabular mt-0.5 block">
                {data.first_purchase_at ? formatDateLong(data.first_purchase_at) : "ثبت نشده"}
              </span>
            </div>
            <div className="px-2 sm:px-3">
              <span className="text-[10px] text-muted block">آخرین خرید ثبت‌شده</span>
              <span className="font-bold text-accent tabular mt-0.5 block">
                {data.last_purchase_at ? formatDateLong(data.last_purchase_at) : "ثبت نشده"}
              </span>
            </div>
          </div>
        </div>

        {/* Middle Row: 4 Clean KPI Metric Boxes */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-line text-xs">
          <div className="bg-elevated p-3.5 rounded-2xl border border-line">
            <span className="text-muted block text-[11px]">مجموع دفعات خرید</span>
            <div className="text-xl sm:text-2xl font-black text-ink tabular mt-1">
              {formatNumber(data.purchase_count)} <span className="text-xs font-normal text-muted">فاکتور</span>
            </div>
            <div className="text-[10px] text-muted mt-1">
              {formatNumber(data.online_count)} آنلاین • {formatNumber(data.pos_count)} حضوری
            </div>
          </div>

          <div className="bg-elevated p-3.5 rounded-2xl border border-line">
            <span className="text-muted block text-[11px]">کل اقلام خریداری‌شده</span>
            <div className="text-xl sm:text-2xl font-black text-ink tabular mt-1">
              {formatNumber(data.items_sold)} <span className="text-xs font-normal text-muted">قلم کالا</span>
            </div>
            <div className="text-[10px] text-muted mt-1">
              میانگین هر فاکتور:{" "}
              <strong className="text-ink tabular">
                {data.purchase_count > 0 ? (data.items_sold / data.purchase_count).toFixed(1) : "۰"} قلم
              </strong>
            </div>
          </div>

          <div className="bg-elevated p-3.5 rounded-2xl border border-line">
            <span className="text-muted block text-[11px]">خطوط فروش فعال</span>
            <div className="text-xl sm:text-2xl font-black text-ink tabular mt-1">
              {formatNumber(data.sales_line_count)} <span className="text-xs font-normal text-muted">از ۴ کانال</span>
            </div>
            <div className="text-[10px] text-accent font-semibold mt-1">
              {data.channel === "both"
                ? "مشتری دوکاناله (Omnichannel)"
                : data.channel === "online"
                ? "خریدار صرفاً آنلاین"
                : data.channel === "physical"
                ? "خریدار شعب حضوری"
                : "بدون سابقه خرید"}
            </div>
          </div>

          <div className="bg-elevated p-3.5 rounded-2xl border border-line">
            <span className="text-muted block text-[11px]">تخفیف‌ها و آدرس‌ها</span>
            <div className="text-xl sm:text-2xl font-black text-ink tabular mt-1">
              {formatNumber(data.discounts.length)} <span className="text-xs font-normal text-muted">تخفیف</span>
            </div>
            <div className="text-[10px] text-muted mt-1">
              نشانی‌های ثبت‌شده: <strong className="text-ink tabular">{formatNumber(data.addresses.length)} مورد</strong>
            </div>
          </div>
        </div>

        {/* Bottom Row: Omnichannel Sales Line Breakdown & Visual Distribution Bar */}
        <div className="pt-4 border-t border-line space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted font-medium">توزیع خرید بین کانال آنلاین و شعب حضوری</span>
            {totalSalesLinePurchases > 0 && (
              <div className="h-2 w-full sm:w-64 rounded-full bg-elevated overflow-hidden flex border border-line/60">
                {data.sales_lines.map((line) => {
                  const pct = totalSalesLinePurchases > 0 ? (line.purchase_count / totalSalesLinePurchases) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={line.key}
                      style={{ width: `${pct}%` }}
                      className={LINE_COLORS[line.key] || "bg-accent"}
                      title={`${line.label}: ${formatNumber(line.purchase_count)} خرید`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {data.sales_lines.map((line) => {
              const pct =
                totalSalesLinePurchases > 0 ? Math.round((line.purchase_count / totalSalesLinePurchases) * 100) : 0;
              return (
                <div
                  key={line.key}
                  className={`rounded-2xl px-3.5 py-2.5 border transition-colors ${
                    line.used
                      ? "bg-elevated border-line"
                      : "bg-elevated/40 border-line/50 opacity-65"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={salesLineTone(line.key)}>{line.label}</Badge>
                    <span className="tabular text-sm font-black text-ink">
                      {formatNumber(line.purchase_count)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                    <span>{line.used ? "استفاده شده" : "بدون خرید"}</span>
                    {line.used && <span className="tabular font-semibold">{formatNumber(pct)}٪</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Subtle Contextual Note */}
      <p className="text-[11px] leading-5 text-muted px-1">
        {data.is_operator
          ? "ℹ️ این حساب دفتر ثبت سفارش است. سفارش‌ها و مبلغ‌شان در فروش می‌مانند و در سطح‌بندی و شمارش مشتری حساب نمی‌شوند. نام گیرنده کنار هر سفارش آنلاین آمده است."
          : "ℹ️ تعداد خرید با تعریف لیست مشتریان یکسان است. در سوابق زیر، مبلغ سفارش‌های آنلاین و ریزاقلام تمامی خریدهای آنلاین و حضوری قابل مشاهده است."}
      </p>

      {/* ============================================================== */}
      {/* 3. SEGMENTED NAVIGATION TABS                                   */}
      {/* ============================================================== */}
      <div
        role="tablist"
        aria-label="بخش‌های شناسنامه مشتری"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-elevated p-1.5 rounded-2xl border border-line text-xs"
      >
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                active
                  ? "bg-accent text-on-accent font-bold shadow-xs"
                  : "text-muted hover:text-ink hover:bg-surface/60 font-medium"
              }`}
            >
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] tabular ${
                    active ? "bg-white/20 text-white" : "bg-surface text-muted border border-line"
                  }`}
                >
                  {formatNumber(item.count)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* 4. TAB CONTENTS                                                */}
      {/* ============================================================== */}
      <div>
        {tab === "purchases" ? (
          <PurchaseHistory
            purchases={purchases}
            loading={historyLoading}
            openKey={openKey}
            filter={purchaseFilter}
            onFilterChange={setPurchaseFilter}
            onToggle={setOpenKey}
            onPageChange={setHistoryPage}
          />
        ) : null}

        {tab === "products" ? (
          productsLoading || products === null ? (
            productsError ? (
              <ErrorState onRetry={() => setProductRetry((value) => value + 1)} />
            ) : (
              <Skeleton className="h-64 rounded-3xl" />
            )
          ) : (
            <ProductHistory products={products} />
          )
        ) : null}

        {tab === "profile" ? <ProfileTab data={data} displayName={display.name} /> : null}
        {tab === "addresses" ? <AddressTab addresses={data.addresses} /> : null}
        {tab === "discounts" ? <DiscountTab discounts={data.discounts} /> : null}
      </div>
    </div>
  );
}

function PurchaseHistory({
  purchases,
  loading,
  openKey,
  filter,
  onFilterChange,
  onToggle,
  onPageChange,
}: {
  purchases: Customer360["purchases"];
  loading: boolean;
  openKey: string | null;
  filter: PurchaseKindFilter;
  onFilterChange: (next: PurchaseKindFilter) => void;
  onToggle: (key: string | null) => void;
  onPageChange: (page: number) => void;
}) {
  const filteredResults = useMemo(() => {
    if (filter === "all") return purchases.results;
    if (filter === "online") return purchases.results.filter((r) => r.kind === "online");
    if (filter === "pos") return purchases.results.filter((r) => r.kind === "pos");
    return purchases.results.filter((r) => r.is_cancelled || r.type === "refund");
  }, [purchases.results, filter]);

  if (!purchases.total) {
    return <EmptyState title="خریدی برای این مشتری ثبت نشده است." body="ثبت‌نام به‌معنای خرید نیست." />;
  }

  return (
    <div className="bento-card p-4 sm:p-6 glass-rim shadow-soft space-y-4">
      {/* Header & Quick Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-ink">سوابق فاکتورها و خریدها</h3>
          <p className="text-[11px] text-muted mt-0.5">
            برای مشاهده ریزاقلام، رنگ و سایز هر خرید روی ردیف مورد نظر کلیک کنید
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(
            [
              { key: "all", label: `همه (${formatNumber(purchases.total)})` },
              { key: "online", label: "آنلاین" },
              { key: "pos", label: "حضوری (POS)" },
              { key: "cancelled", label: "مرجوعی / لغوشده" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFilterChange(item.key)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                filter === item.key
                  ? "bg-accent text-on-accent"
                  : "bg-elevated text-muted border border-line hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
          {loading && <span className="text-[11px] text-accent mr-1">در حال بارگذاری...</span>}
        </div>
      </div>

      {filteredResults.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted">
          در این صفحه موردی با فیلتر انتخاب‌شده وجود ندارد.
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="text-muted border-b border-line font-semibold">
                  <th className="py-3 px-3">تاریخ</th>
                  <th className="py-3 px-3">خط فروش</th>
                  <th className="py-3 px-3">شناسه</th>
                  <th className="py-3 px-3">گیرنده</th>
                  <th className="py-3 px-3">نوع</th>
                  <th className="py-3 px-3">اقلام</th>
                  <th className="py-3 px-3">وضعیت</th>
                  <th className="py-3 px-3">مبلغ</th>
                  <th className="py-3 px-3 text-center">جزئیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredResults.map((row) => {
                  const open = openKey === row.key;
                  return (
                    <Fragment key={row.key}>
                      <tr
                        className="hover:bg-hover transition-colors cursor-pointer"
                        onClick={() => onToggle(open ? null : row.key)}
                      >
                        <td className="px-3 py-3 text-muted font-mono">{formatDate(row.created_at)}</td>
                        <td className="px-3 py-3">
                          <Badge tone={salesLineTone(row.sales_line)}>{row.sales_line_label}</Badge>
                        </td>
                        <td className="ltr-iso px-3 py-3 tabular font-mono text-muted">#{row.source_id}</td>
                        <td className="px-3 py-3 text-ink">{row.receiver || "—"}</td>
                        <td className="px-3 py-3 text-muted">{row.type_label}</td>
                        <td className="px-3 py-3 tabular font-bold text-ink">{formatNumber(row.item_count)} قلم</td>
                        <td className="px-3 py-3">
                          {row.kind === "online" ? (
                            <StatusBadge status={row.status} label={row.status_label} />
                          ) : (
                            <Badge tone={row.type === "refund" || row.is_cancelled ? "rose" : "sage"}>
                              {row.status_label}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 tabular font-bold text-ink">
                          {row.value_kind === "online_total" ? formatToman(row.value) : "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            className="text-xs font-bold text-accent hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggle(open ? null : row.key);
                            }}
                          >
                            {open ? "بستن ▴" : "مشاهده جزئیات ▾"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={9} className="bg-elevated/60 px-4 py-3.5">
                            <PurchaseDetail purchase={row} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-2.5">
            {filteredResults.map((row) => {
              const open = openKey === row.key;
              return (
                <div
                  key={row.key}
                  className="rounded-2xl border border-line bg-elevated/60 p-3.5 space-y-2.5 text-xs"
                >
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => onToggle(open ? null : row.key)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone={salesLineTone(row.sales_line)}>{row.sales_line_label}</Badge>
                      <span className="font-mono text-muted ltr-iso">#{row.source_id}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted">{formatDate(row.created_at)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-line/60">
                    <div>
                      <span className="text-[10px] text-muted block">تعداد و مبلغ:</span>
                      <span className="font-bold text-ink tabular">
                        {formatNumber(row.item_count)} قلم
                        {row.value_kind === "online_total" ? ` • ${formatToman(row.value)}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.kind === "online" ? (
                        <StatusBadge status={row.status} label={row.status_label} />
                      ) : (
                        <Badge tone={row.type === "refund" || row.is_cancelled ? "rose" : "sage"}>
                          {row.status_label}
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggle(open ? null : row.key)}
                        className="text-accent font-bold text-[11px]"
                      >
                        {open ? "بستن ▴" : "ریزاقلام ▾"}
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="pt-2 border-t border-line">
                      <PurchaseDetail purchase={row} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <Pagination page={purchases.page} total={purchases.total} perPage={purchases.per_page} onChange={onPageChange} />
    </div>
  );
}

function PurchaseDetail({ purchase }: { purchase: CustomerPurchase }) {
  if (!purchase.items.length) {
    return <div className="text-xs text-muted">اقلامی برای این سابقه ثبت نشده است.</div>;
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-2.5">
      <div className="flex items-center justify-between text-xs font-bold text-ink">
        <span>اقلام فاکتور #{purchase.source_id}</span>
        {purchase.discount_amount > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400 font-normal">
            تخفیف فاکتور: <strong>{formatToman(purchase.discount_amount)}</strong>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-xs">
          <thead>
            <tr className="text-right text-[11px] text-muted border-b border-line/70">
              {["محصول", "تنوع", "تعداد", "رنگ", "سایز", "مبلغ قلم", "تخفیف قلم"].map((column) => (
                <th key={column} className="px-2 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {purchase.items.map((item) => (
              <tr key={item.id}>
                <td className="px-2 py-2 font-semibold text-ink">
                  {item.product}
                  {item.type_label ? <div className="mt-0.5 text-[10px] text-muted">{item.type_label}</div> : null}
                </td>
                <td className="px-2 py-2 text-muted">{item.variant || "—"}</td>
                <td className="px-2 py-2 tabular font-bold">{formatNumber(item.quantity)}</td>
                <td className="px-2 py-2 text-muted">{item.color || "—"}</td>
                <td className="px-2 py-2 text-muted font-mono">{item.size || "—"}</td>
                <td className="px-2 py-2 tabular font-semibold">{formatToman(item.amount)}</td>
                <td className="px-2 py-2 tabular text-muted">
                  {item.discount_amount ? formatToman(item.discount_amount) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductHistory({ products }: { products: CustomerProductHistory[] }) {
  const [query, setQuery] = useState("");

  const styleSummary = useMemo(() => {
    const sizes = new Map<string, number>();
    const colors = new Map<string, number>();
    for (const item of products) {
      for (const s of item.sizes) {
        if (s) sizes.set(s, (sizes.get(s) || 0) + item.total_quantity);
      }
      for (const c of item.colors) {
        if (c) colors.set(c, (colors.get(c) || 0) + item.total_quantity);
      }
    }
    const topSizes = [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topColors = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { topSizes, topColors };
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.product.toLowerCase().includes(q) ||
        p.colors.some((c) => c.toLowerCase().includes(q)) ||
        p.sizes.some((s) => s.toLowerCase().includes(q)),
    );
  }, [products, query]);

  if (!products.length) {
    return <EmptyState title="محصول خریداری‌شده‌ای برای این مشتری نیست." />;
  }

  return (
    <div className="space-y-4">
      {/* Wardrobe Style & Size DNA Summary Cards */}
      {(styleSummary.topSizes.length > 0 || styleSummary.topColors.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="bento-card p-4 glass-rim shadow-soft space-y-2">
            <span className="text-xs font-extrabold text-ink block">📏 سایزهای پرتکرار مشتری</span>
            <div className="flex flex-wrap gap-1.5">
              {styleSummary.topSizes.map(([sz, count]) => (
                <span
                  key={sz}
                  className="px-2.5 py-1 rounded-xl bg-accent/15 text-accent border border-accent/25 text-xs font-mono font-bold"
                >
                  {sz} <span className="text-[10px] font-sans opacity-80">({formatNumber(count)} عدد)</span>
                </span>
              ))}
            </div>
          </div>

          <div className="bento-card p-4 glass-rim shadow-soft space-y-2">
            <span className="text-xs font-extrabold text-ink block">🎨 پالت رنگ‌های محبوب</span>
            <div className="flex flex-wrap gap-1.5">
              {styleSummary.topColors.map(([clr, count]) => (
                <span
                  key={clr}
                  className="px-2.5 py-1 rounded-xl bg-elevated border border-line text-ink text-xs font-semibold"
                >
                  {clr} <span className="text-[10px] text-muted">({formatNumber(count)} عدد)</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Products Table Card */}
      <div className="bento-card p-4 sm:p-6 glass-rim shadow-soft space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-ink">کمد لباس و تاریخچه کالاها</h3>
            <p className="text-[11px] text-muted mt-0.5">مرتب‌شده بر اساس بیشترین تعداد خرید</p>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی نام کالا، رنگ یا سایز..."
            className="w-full sm:w-64 px-3 py-1.5 rounded-xl bg-elevated border border-line text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="text-muted border-b border-line font-semibold">
                <th className="py-2.5 px-3">محصول</th>
                <th className="py-2.5 px-3">تعداد کل</th>
                <th className="py-2.5 px-3">دفعات خرید</th>
                <th className="py-2.5 px-3">آخرین خرید</th>
                <th className="py-2.5 px-3">رنگ‌ها</th>
                <th className="py-2.5 px-3">سایزها</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => (
                <tr key={`${row.product}-${row.last_purchase_at}`} className="hover:bg-hover transition-colors">
                  <td className="px-3 py-3 font-bold text-ink">{row.product}</td>
                  <td className="px-3 py-3 tabular font-bold text-accent">{formatNumber(row.total_quantity)} عدد</td>
                  <td className="px-3 py-3 tabular">{formatNumber(row.purchase_count)} فاکتور</td>
                  <td className="px-3 py-3 text-muted font-mono">{formatDate(row.last_purchase_at)}</td>
                  <td className="px-3 py-3 text-muted">{joinFacts(row.colors)}</td>
                  <td className="px-3 py-3 text-muted font-mono">{joinFacts(row.sizes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ data, displayName }: { data: Customer360; displayName: string }) {
  const rows: ReadonlyArray<{ label: string; value: string; ltr?: boolean }> = [
    { label: "نام و نام خانوادگی", value: displayName },
    { label: "شماره موبایل", value: data.mobile ? formatMobile(data.mobile) : INCOMPLETE_LABEL, ltr: true },
    { label: "ایمیل", value: profileValue(data.email), ltr: true },
    { label: "وضعیت حساب", value: profileValue(data.status_label) },
    { label: "جنسیت", value: profileValue(data.profile.gender_label || data.profile.gender) },
    { label: "کد ملی", value: profileValue(data.profile.national_code), ltr: true },
    { label: "تاریخ تولد", value: data.profile.birth_date ? formatDate(data.profile.birth_date) : "ثبت نشده" },
    { label: "سطح باشگاه", value: profileValue(data.profile.club_level) },
    { label: "شماره کارت", value: profileValue(data.profile.card_number), ltr: true },
    { label: "تاریخ ایجاد در منبع", value: data.profile.created_at ? formatDate(data.profile.created_at) : "ثبت نشده" },
    { label: "آخرین به‌روزرسانی منبع", value: data.profile.updated_at ? formatDate(data.profile.updated_at) : "ثبت نشده" },
  ];

  return (
    <div className="bento-card p-5 sm:p-6 glass-rim shadow-soft">
      <h3 className="text-sm sm:text-base font-extrabold text-ink mb-4">اطلاعات هویتی و پرونده باشگاه</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-elevated border border-line text-xs"
          >
            <span className="text-muted font-medium">{item.label}</span>
            <span className={`font-bold text-ink ${item.ltr ? "ltr-iso tabular font-mono" : ""}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddressTab({ addresses }: { addresses: Customer360["addresses"] }) {
  if (!addresses.length) {
    return <EmptyState title="آدرسی برای این مشتری ثبت نشده است." />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {addresses.map((address, index) => (
        <div
          key={`${address.postal_code}-${index}`}
          className="bento-card p-5 glass-rim shadow-soft space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold">
                {profileValue(address.province)}
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-elevated border border-line text-ink font-bold">
                {profileValue(address.city)}
              </span>
            </div>
            <span className="text-[11px] text-muted font-mono ltr-iso">
              کد پستی: {profileValue(address.postal_code)}
            </span>
          </div>

          <p className="text-ink leading-6 bg-elevated p-3 rounded-xl border border-line">
            {profileValue(address.address)}
          </p>

          <div className="flex items-center justify-between text-[11px] text-muted pt-1">
            <span>
              تحویل‌گیرنده: <strong className="text-ink">{profileValue(address.recipient_name)}</strong>
            </span>
            <span className="font-mono ltr-iso">{profileValue(address.recipient_mobile)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiscountTab({ discounts }: { discounts: Customer360["discounts"] }) {
  if (!discounts.length) {
    return <EmptyState title="تخفیف ثبت‌شده‌ای برای این مشتری نیست." />;
  }

  const totalDiscount = discounts.reduce((sum, row) => sum + (row.discount_amount || 0), 0);

  return (
    <div className="bento-card p-4 sm:p-6 glass-rim shadow-soft space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-ink">سوابق استفاده از تخفیف</h3>
          <p className="text-[11px] text-muted mt-0.5">تمامی سفارش‌های آنلاین و حضوری دارای مبلغ تخفیف</p>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-bold tabular">
          مجموع تخفیف دریافتی: {formatToman(totalDiscount)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="text-muted border-b border-line font-semibold">
              <th className="py-2.5 px-3">تاریخ</th>
              <th className="py-2.5 px-3">خط فروش</th>
              <th className="py-2.5 px-3">شناسه فاکتور</th>
              <th className="py-2.5 px-3">وضعیت</th>
              <th className="py-2.5 px-3">مبلغ تخفیف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {discounts.map((row) => (
              <tr key={`${row.kind}-${row.source_id}`} className="hover:bg-hover transition-colors">
                <td className="px-3 py-3 text-muted font-mono">{formatDate(row.created_at)}</td>
                <td className="px-3 py-3">
                  <Badge tone={salesLineTone(row.sales_line)}>{row.sales_line_label}</Badge>
                </td>
                <td className="ltr-iso px-3 py-3 tabular font-mono">#{row.source_id}</td>
                <td className="px-3 py-3 text-muted">{row.status_label}</td>
                <td className="px-3 py-3 tabular font-bold text-emerald-600 dark:text-emerald-400">
                  {formatToman(row.discount_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
