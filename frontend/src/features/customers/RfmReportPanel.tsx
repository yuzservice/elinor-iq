import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, Skeleton } from "../../components/Table";
import { useApi } from "../../hooks/useApi";
import { formatCompactToman, formatDateTime, formatNumber, formatPercent } from "../../lib/format";
import { customersService, type RfmFilters } from "../../services/customers";
import type { RfmKpi, RfmMatrixCell, RfmSummary } from "../../types";
import { SALES_LINE_OPTIONS } from "./customerListFilters";
import {
  MATRIX_METRICS,
  MOVEMENT_WINDOWS,
  formatDelta,
  formatKpiValue,
  formatSigned,
  matrixCellValue,
  matrixTooltip,
  sparklinePath,
  type MatrixMetric,
} from "./rfmFormat";
import { SCORE_LABELS, rfmSegment } from "./rfmDisplay";

const PAYMENT_OPTIONS = [
  { value: "", label: "همه کانال‌های پرداخت" },
  { value: "snappay", label: "اسنپ‌پی" },
  { value: "digipay", label: "دیجی‌پی" },
  { value: "other", label: "سایر" },
];

const KPI_CARDS: { key: keyof RfmSummary["kpis"]; label: string; hint: string }[] = [
  { key: "buyers_30d", label: "خریداران ۳۰ روز اخیر", hint: "مشتریانی که در ۳۰ روز گذشته خرید کرده‌اند" },
  { key: "active_customers_12m", label: "مشتریان فعال ۱۲ ماه", hint: "دست‌کم یک خرید در ۱۲ ماه اخیر" },
  { key: "second_purchase_90d", label: "خرید دوم در ۹۰ روز", hint: "از مشتریانی که اولین خریدشان ۹۰ تا ۴۵۵ روز پیش بوده" },
  { key: "value_at_risk", label: "ارزش در خطر", hint: "خرید خالص کل «در خطر» و «نباید از دست برود»" },
];

const SCORES = [5, 4, 3, 2, 1];

function selectClass() {
  return "rounded-xl border border-line bg-elevated px-3 py-1.5 text-ink focus:border-accent focus:outline-none";
}

export function RfmReportPanel() {
  const [salesLine, setSalesLine] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const navigate = useNavigate();
  const filters: RfmFilters = { sales_line: salesLine || undefined, payment_method: paymentMethod || undefined };
  const { data, loading, error } = useApi(() => customersService.rfmSummary(filters), [salesLine, paymentMethod]);

  const openList = (params: Record<string, string>) => {
    const next = new URLSearchParams({ tab: "list", ...params });
    if (salesLine) next.set("sales_line", salesLine);
    if (paymentMethod) next.set("payment_method", paymentMethod);
    navigate(`/customers?${next.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-tight text-ink sm:text-xl">گزارش RFM مشتریان</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            با چه کسی، الان چه کنیم؟ تازگی، تکرار و ارزش خرید؛ مستقل از سطح‌های وفاداری. مبالغ «خرید خالص مشتری» است، نه فروش.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="شعبه" value={salesLine} onChange={(event) => setSalesLine(event.target.value)} className={selectClass()}>
            <option value="">همه شعب و آنلاین</option>
            {SALES_LINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select aria-label="کانال پرداخت" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={selectClass()}>
            {PAYMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {data?.computed_at ? <span className="text-[11px] text-faint">آخرین محاسبه: {formatDateTime(data.computed_at)}</span> : null}
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-72" />
        </div>
      ) : error && !data ? (
        <ErrorState />
      ) : data ? (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {KPI_CARDS.map((card) => (
              <KpiCard key={card.key} label={card.label} hint={card.hint} kpi={data.kpis[card.key]} previousLabel={data.previous_month.label} />
            ))}
          </div>
          <Composition data={data} />
          <SegmentsTable data={data} filters={filters} onOpen={(key) => openList({ rfm_segment: key })} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Matrix data={data} onOpen={(r, f) => openList({ r_score: String(r), f_score: String(f) })} />
            <Movement filters={filters} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Funnel data={data} />
            <Reactivated data={data} />
          </div>
          <footer className="space-y-1 text-[11px] leading-5 text-faint">
            {data.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            {data.counts.internal_accounts_excluded ? (
              <p>{formatNumber(data.counts.internal_accounts_excluded)} حساب داخلی از این گزارش خارج شده است.</p>
            ) : null}
            <p>
              مشتری خریدار: {formatNumber(data.counts.purchasing_customers)} · ثبت‌نام بدون خرید:{" "}
              {formatNumber(data.counts.registered_without_purchase)}
            </p>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`bento-card glass-rim p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
}

function KpiCard({ label, hint, kpi, previousLabel }: { label: string; hint: string; kpi: RfmKpi; previousLabel: string }) {
  const delta = formatDelta(kpi.delta_pct, previousLabel);
  // For value at risk a rise is bad news.
  const good = label === "ارزش در خطر" ? delta?.direction === "down" : delta?.direction === "up";
  const values = kpi.trend.map((item) => item.value);
  const path = sparklinePath(values, 120, 32);
  const secondary = kpi.secondary;
  return (
    <Card>
      <div className="text-xs font-semibold text-muted" title={hint}>
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-2xl font-black text-ink tabular">{formatKpiValue(kpi.value, kpi.unit)}</div>
        {path ? (
          <svg width="120" height="32" viewBox="0 0 120 32" className="shrink-0 text-accent" aria-hidden="true" role="img">
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>
      <div className="mt-1 min-h-[1.25rem] text-[11px]">
        {delta ? (
          <span className={delta.direction === "flat" ? "text-muted" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
            {delta.text}
          </span>
        ) : (
          <span className="text-faint">بدون مقایسه با ماه قبل</span>
        )}
      </div>
      {secondary ? (
        <div className="mt-1 text-[11px] text-muted">
          {secondary.label}: <span className="font-bold text-ink tabular">{secondary.unit === "percent" ? formatPercent(secondary.value) : formatNumber(secondary.value)}</span>
        </div>
      ) : null}
    </Card>
  );
}

function Composition({ data }: { data: RfmSummary }) {
  const [active, setActive] = useState<string | null>(null);
  const current = data.composition.find((item) => item.key === active);
  const bars: { label: string; field: "pct_customers" | "pct_lifetime_amount" }[] = [
    { label: "سهم از مشتریان", field: "pct_customers" },
    { label: "سهم از خرید خالص", field: "pct_lifetime_amount" },
  ];
  return (
    <Card>
      <div className="space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.field} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-[11px] text-muted">
            <span>{bar.label}</span>
            <div className="flex h-3 overflow-hidden rounded-full bg-hover">
              {data.composition.map((item) =>
                item[bar.field] > 0 ? (
                  <button
                    key={item.key}
                    type="button"
                    aria-label={`${item.label}: ${formatPercent(item[bar.field])}`}
                    title={`${item.label}: ${formatPercent(item[bar.field])}`}
                    onMouseEnter={() => setActive(item.key)}
                    onFocus={() => setActive(item.key)}
                    onClick={() => setActive(item.key === active ? null : item.key)}
                    className={`h-full transition-opacity ${rfmSegment(item.key)?.dot ?? "bg-line"} ${active && active !== item.key ? "opacity-40" : ""}`}
                    style={{ width: `${item[bar.field]}%` }}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {data.composition.map((item) => (
          <button key={item.key} type="button" onClick={() => setActive(item.key === active ? null : item.key)} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${rfmSegment(item.key)?.dot ?? "bg-line"}`} />
            <span className={item.key === active ? "font-bold text-ink" : ""}>{item.label}</span>
          </button>
        ))}
      </div>
      {current ? (
        <p className="mt-2 text-xs text-ink">
          {current.label}: {formatNumber(current.count)} مشتری ({formatPercent(current.pct_customers)}) ·{" "}
          {formatCompactToman(current.lifetime_amount_sum)} ({formatPercent(current.pct_lifetime_amount)} از خرید خالص)
        </p>
      ) : null}
    </Card>
  );
}

function SegmentsTable({ data, filters, onOpen }: { data: RfmSummary; filters: RfmFilters; onOpen: (key: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const cells = new Map(data.matrix.map((cell) => [`${cell.r}-${cell.f}`, cell]));

  const exportCsv = async (key: string) => {
    setExporting(key);
    try {
      await customersService.exportList({ ...filters, rfm_segment: key, sort: "rfm" });
    } finally {
      setExporting(null);
    }
  };

  const actions = (key: string, count: number) => (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onOpen(key)}
        disabled={!count}
        className="whitespace-nowrap rounded-xl bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-40"
      >
        مشتریان
      </button>
      <button
        type="button"
        onClick={() => exportCsv(key)}
        disabled={!count || exporting === key}
        className="whitespace-nowrap rounded-xl border border-line px-2.5 py-1 text-[11px] font-bold text-muted hover:text-ink disabled:opacity-40"
      >
        {exporting === key ? "…" : "خروجی CSV"}
      </button>
    </div>
  );

  const details = (key: string) => {
    const segment = data.segments.find((item) => item.key === key)!;
    return (
      <div className="grid grid-cols-2 gap-3 text-[11px] text-muted sm:grid-cols-5">
        <span>میانگین روز: <b className="text-ink tabular">{formatNumber(segment.avg_days_since_last)}</b></span>
        <span>میانگین خرید: <b className="text-ink tabular">{formatNumber(segment.avg_purchase_count)}</b></span>
        <span>خرید ۱۲ ماه: <b className="text-ink">{formatCompactToman(segment.amount_12m_sum)}</b></span>
        <span>پرارزش: <b className="text-ink tabular">{formatNumber(segment.high_value_count)}</b></span>
        <span>
          خانه‌ها:{" "}
          {segment.cells.map(([r, f]) => (
            <b key={`${r}-${f}`} className="ml-1.5 text-ink tabular">
              R{formatNumber(r)}F{formatNumber(f)}({formatNumber(cells.get(`${r}-${f}`)?.count ?? 0)})
            </b>
          ))}
        </span>
      </div>
    );
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">سگمنت‌ها</h3>
        <span className="text-[11px] text-faint">مرتب‌شده بر اساس فوریت اقدام</span>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="px-2 py-2 font-semibold">سگمنت</th>
              <th className="px-2 py-2 font-semibold">مشتری</th>
              <th className="px-2 py-2 font-semibold">سهم از خرید خالص</th>
              <th className="px-2 py-2 font-semibold">دیرتر از معمول</th>
              <th className="px-2 py-2 font-semibold">اقدام پیشنهادی</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.segments.map((segment) => (
              <Fragment key={segment.key}>
                <tr className="hover:bg-hover">
                  <td className="whitespace-nowrap px-2 py-2.5">
                    <button
                      type="button"
                      aria-expanded={open === segment.key}
                      onClick={() => setOpen(open === segment.key ? null : segment.key)}
                      className="inline-flex items-center gap-1.5 font-bold text-ink"
                    >
                      <span className="text-[9px] text-faint">{open === segment.key ? "▾" : "◂"}</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${rfmSegment(segment.key)?.dot ?? "bg-line"}`} />
                      {segment.label}
                    </button>
                  </td>
                  <td className="px-2 py-2.5 tabular">
                    <div className="font-bold text-ink">
                      {formatNumber(segment.count)} <span className="text-[10px] font-normal text-muted">({formatPercent(segment.pct_customers)})</span>
                    </div>
                    <div className="text-[10px] text-muted">ماه قبل: {formatSigned(segment.delta_count_vs_previous_month)}</div>
                  </td>
                  <td className="px-2 py-2.5">
                    <ShareBar pct={segment.pct_lifetime_amount} dot={rfmSegment(segment.key)?.dot} />
                  </td>
                  <td className="px-2 py-2.5 tabular">{formatNumber(segment.overdue_count)}</td>
                  <td className="px-2 py-2.5 text-muted">{segment.action}</td>
                  <td className="px-2 py-2.5">{actions(segment.key, segment.count)}</td>
                </tr>
                {open === segment.key ? (
                  <tr className="bg-elevated/60">
                    <td colSpan={6} className="px-3 py-2.5">
                      {details(segment.key)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2.5 md:hidden">
        {data.segments.map((segment) => (
          <div key={segment.key} className="space-y-2 rounded-2xl border border-line bg-elevated p-3">
            <button
              type="button"
              aria-expanded={open === segment.key}
              onClick={() => setOpen(open === segment.key ? null : segment.key)}
              className="flex w-full items-center justify-between gap-2"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
                <span className={`h-2.5 w-2.5 rounded-full ${rfmSegment(segment.key)?.dot ?? "bg-line"}`} />
                {segment.label}
              </span>
              <span className="text-xs text-muted tabular">
                {formatNumber(segment.count)} · {formatSigned(segment.delta_count_vs_previous_month)}
              </span>
            </button>
            <ShareBar pct={segment.pct_lifetime_amount} dot={rfmSegment(segment.key)?.dot} />
            <p className="text-[11px] text-muted">
              دیرتر از معمول: <b className="text-ink tabular">{formatNumber(segment.overdue_count)}</b> · {segment.action}
            </p>
            {open === segment.key ? details(segment.key) : null}
            {actions(segment.key, segment.count)}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ShareBar({ pct, dot }: { pct: number; dot?: string }) {
  return (
    <div className="flex min-w-[7rem] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
        <div className={`h-full rounded-full ${dot ?? "bg-accent"}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-12 text-left text-[11px] text-ink tabular">{formatPercent(pct)}</span>
    </div>
  );
}

function useCanHover() {
  const [canHover, setCanHover] = useState(true);
  useEffect(() => {
    const query = window.matchMedia?.("(hover: hover)");
    if (!query) return;
    setCanHover(query.matches);
    const listener = (event: MediaQueryListEvent) => setCanHover(event.matches);
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }, []);
  return canHover;
}

function Matrix({ data, onOpen }: { data: RfmSummary; onOpen: (r: number, f: number) => void }) {
  const [metric, setMetric] = useState<MatrixMetric>("count");
  const [hovered, setHovered] = useState<RfmMatrixCell | null>(null);
  const [sheet, setSheet] = useState<RfmMatrixCell | null>(null);
  const canHover = useCanHover();
  const cells = new Map(data.matrix.map((cell) => [`${cell.r}-${cell.f}`, cell]));
  const rLabels = new Map(data.axis_labels.r.map((item) => [item.score, item.label]));
  const fLabels = new Map(data.axis_labels.f.map((item) => [item.score, item.label]));
  const tooltip = hovered ? matrixTooltip(hovered) : null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">ماتریس تازگی × تکرار</h3>
        <div className="inline-flex rounded-xl border border-line bg-elevated p-0.5 text-[11px]" role="radiogroup" aria-label="معیار خانه‌ها">
          {MATRIX_METRICS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={metric === item.id}
              onClick={() => setMetric(item.id)}
              className={`rounded-lg px-2.5 py-1 font-bold ${metric === item.id ? "bg-surface text-ink shadow-xs" : "text-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative" onMouseLeave={() => setHovered(null)}>
        <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1 text-[10px] sm:text-[11px]">
          <span />
          {SCORES.map((f) => (
            <span key={`f-${f}`} className="pb-1 text-center leading-4 text-muted">
              {SCORE_LABELS.f} {formatNumber(f)}
              <span className="block text-[9px] text-faint">{fLabels.get(f)}</span>
            </span>
          ))}
          {SCORES.map((r) => (
            <div key={`r-${r}`} className="contents">
              <span className="flex flex-col justify-center whitespace-nowrap pl-1.5 leading-4 text-muted">
                {SCORE_LABELS.r} {formatNumber(r)}
                <span className="text-[9px] text-faint">{rLabels.get(r)}</span>
              </span>
              {SCORES.map((f) => {
                const cell = cells.get(`${r}-${f}`);
                if (!cell) return <span key={`${r}-${f}`} />;
                const segment = rfmSegment(cell.segment);
                return (
                  <button
                    key={`${r}-${f}`}
                    type="button"
                    onMouseEnter={() => canHover && setHovered(cell)}
                    onFocus={() => setHovered(cell)}
                    onClick={() => (canHover ? cell.count && onOpen(r, f) : setSheet(cell))}
                    aria-label={matrixTooltip(cell).join(" — ")}
                    className={`flex h-12 items-center justify-center rounded-lg font-bold tabular transition-transform hover:scale-[1.03] ${segment?.cell ?? "bg-hover"} ${cell.count ? "" : "opacity-50"}`}
                  >
                    {matrixCellValue(cell, metric)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {tooltip && canHover ? (
          <div className="pointer-events-none absolute inset-x-0 -bottom-2 translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-[11px] shadow-soft" role="tooltip">
            <div className="font-bold text-ink">{tooltip[0]}</div>
            <div className="text-muted">{tooltip[1]}</div>
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] text-faint">{canHover ? "روی هر خانه بزنید تا مشتریانش را ببینید." : "روی هر خانه بزنید تا جزئیات را ببینید."}</p>
      {sheet ? (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/50" onClick={() => setSheet(null)} role="presentation">
          <div role="dialog" aria-modal="true" className="w-full space-y-2 rounded-t-[24px] bg-surface p-5 text-sm" onClick={(event) => event.stopPropagation()}>
            <p className="font-bold text-ink">{matrixTooltip(sheet)[0]}</p>
            <p className="text-xs text-muted">{matrixTooltip(sheet)[1]}</p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={!sheet.count}
                onClick={() => onOpen(sheet.r, sheet.f)}
                className="flex-1 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-on-accent disabled:opacity-40"
              >
                مشاهده مشتریان
              </button>
              <button type="button" onClick={() => setSheet(null)} className="rounded-xl border border-line px-3 py-2 text-xs text-muted">
                بستن
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Movement({ filters }: { filters: RfmFilters }) {
  const [months, setMonths] = useState(1);
  const { data, loading, error } = useApi(
    () => customersService.rfmMovement({ ...filters, months }),
    [months, filters.sales_line, filters.payment_method],
  );
  const movement = data?.movement;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">جابه‌جایی مشتریان</h3>
        <div className="inline-flex rounded-xl border border-line bg-elevated p-0.5 text-[11px]" role="radiogroup" aria-label="بازه جابه‌جایی">
          {MOVEMENT_WINDOWS.map((item) => (
            <button
              key={item.months}
              type="button"
              role="radio"
              aria-checked={months === item.months}
              onClick={() => setMonths(item.months)}
              className={`rounded-lg px-2.5 py-1 font-bold ${months === item.months ? "bg-surface text-ink shadow-xs" : "text-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : error && !data ? (
        <ErrorState />
      ) : !movement ? (
        <p className="text-sm text-muted">{data?.reason}</p>
      ) : (
        <div className={`space-y-3 text-sm ${loading ? "opacity-60" : ""}`}>
          <p className="text-[11px] text-faint">
            {movement.start_month_label} ← {movement.month_label} · خریدار تازه: <b className="text-ink tabular">{formatNumber(movement.new_purchasers)}</b>
          </p>
          {movement.moves.length ? (
            <ul className="space-y-1">
              {movement.moves.map((move) => (
                <li key={`${move.from}-${move.to}`} className="flex items-center justify-between gap-2 text-muted">
                  <span>
                    {move.from_label} ← {move.to_label}
                  </span>
                  <span className="font-bold text-ink tabular">{formatNumber(move.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">جابه‌جایی‌ای ثبت نشده است.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-right text-[11px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-1.5 py-1.5 font-semibold">سگمنت</th>
                  <th className="px-1.5 py-1.5 font-semibold">شروع</th>
                  <th className="px-1.5 py-1.5 font-semibold">ماندگاری٪</th>
                  <th className="px-1.5 py-1.5 font-semibold">بهتر</th>
                  <th className="px-1.5 py-1.5 font-semibold">بدتر</th>
                  <th className="px-1.5 py-1.5 font-semibold">خالص</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular">
                {movement.segments.map((segment) => (
                  <tr key={segment.key}>
                    <td className="whitespace-nowrap px-1.5 py-1.5 text-ink">{segment.label}</td>
                    <td className="px-1.5 py-1.5">{formatNumber(segment.start_count)}</td>
                    <td className="px-1.5 py-1.5">{segment.start_count ? formatPercent(segment.stayed_pct) : "—"}</td>
                    <td className="px-1.5 py-1.5 text-emerald-600 dark:text-emerald-400">{formatNumber(segment.improved)}</td>
                    <td className="px-1.5 py-1.5 text-rose-600 dark:text-rose-400">{formatNumber(segment.declined)}</td>
                    <td className="px-1.5 py-1.5 text-ink" dir="ltr">
                      {formatSigned(segment.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function Funnel({ data }: { data: RfmSummary }) {
  const funnel = data.second_purchase_funnel;
  return (
    <Card>
      <h3 className="mb-1 text-[15px] font-semibold text-ink">خرید دوم</h3>
      <p className="mb-3 text-[11px] text-faint">خریداران اول ۱۲ ماه اخیر: {formatNumber(funnel.cohort)} مشتری</p>
      <div className="space-y-2">
        {funnel.steps.map((step) => (
          <div key={step.days} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-[11px]">
            <span className="text-muted">تا {formatNumber(step.days)} روز</span>
            <div className="h-2 overflow-hidden rounded-full bg-hover">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, step.pct)}%` }} />
            </div>
            <span className="text-left font-bold text-ink tabular" title={`${formatNumber(step.reached)} از ${formatNumber(step.eligible)}`}>
              {formatPercent(step.pct)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink">
        میانه فاصله تا خرید دوم: <b className="tabular">{funnel.median_days_to_second == null ? "—" : `${formatNumber(funnel.median_days_to_second)} روز`}</b>
      </p>
      {funnel.guidance ? <p className="mt-1 text-xs text-accent">{funnel.guidance}</p> : null}
      <p className="mt-2 text-[10px] text-faint">{funnel.note}</p>
    </Card>
  );
}

function Reactivated({ data }: { data: RfmSummary }) {
  const item = data.reactivated;
  return (
    <Card>
      <h3 className="mb-1 text-[15px] font-semibold text-ink">بازگشتی‌های ۳۰ روز اخیر</h3>
      <p className="mb-3 text-[11px] text-faint">آخرین خرید در ۳۰ روز اخیر، دست‌کم {formatNumber(item.gap_days)} روز بعد از خرید قبلی</p>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-2xl font-black text-ink tabular">{formatNumber(item.count)}</div>
          <div className="text-[11px] text-muted">مشتری</div>
        </div>
        <div>
          <div className="text-lg font-bold text-ink">{formatCompactToman(item.amount)}</div>
          <div className="text-[11px] text-muted">خرید خالص در ۳۰ روز</div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        ۳۰ روز قبل از آن: {formatNumber(item.previous.count)} مشتری · {formatCompactToman(item.previous.amount)}{" "}
        <span className={item.delta_count >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
          ({formatSigned(item.delta_count)})
        </span>
      </p>
    </Card>
  );
}
