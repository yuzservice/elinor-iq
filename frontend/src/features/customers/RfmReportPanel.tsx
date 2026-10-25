import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, Skeleton } from "../../components/Table";
import { useApi } from "../../hooks/useApi";
import { formatCompactToman, formatDateTime, formatNumber, formatPercent } from "../../lib/format";
import { customersService } from "../../services/customers";
import type { RfmSummary } from "../../types";
import { SALES_LINE_OPTIONS } from "./customerListFilters";
import { SCORE_LABELS, rfmSegment, segmentForCell } from "./rfmDisplay";

const PAYMENT_OPTIONS = [
  { value: "", label: "همه کانال‌های پرداخت" },
  { value: "snappay", label: "اسنپ‌پی" },
  { value: "digipay", label: "دیجی‌پی" },
  { value: "other", label: "سایر" },
];

const SCORES = [5, 4, 3, 2, 1];

export function RfmReportPanel() {
  const [salesLine, setSalesLine] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const navigate = useNavigate();
  const { data, loading, error } = useApi(
    () => customersService.rfmSummary({ sales_line: salesLine || undefined, payment_method: paymentMethod || undefined }),
    [salesLine, paymentMethod],
  );

  const openList = (params: Record<string, string>) => {
    const next = new URLSearchParams({ tab: "list", ...params });
    navigate(`/customers?${next.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-tight text-ink sm:text-xl">گزارش RFM مشتریان</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            تازگی، تکرار و ارزش خرید هر مشتری؛ مستقل از سطح‌های وفاداری. مبالغ «خرید خالص مشتری» است، نه فروش.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label="شعبه"
            value={salesLine}
            onChange={(event) => setSalesLine(event.target.value)}
            className="rounded-xl border border-line bg-elevated px-3 py-1.5 text-ink focus:border-accent focus:outline-none"
          >
            <option value="">همه شعب و آنلاین</option>
            {SALES_LINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="کانال پرداخت"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="rounded-xl border border-line bg-elevated px-3 py-1.5 text-ink focus:border-accent focus:outline-none"
          >
            {PAYMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      ) : error && !data ? (
        <ErrorState />
      ) : data ? (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <Kpis data={data} />
          <SegmentsTable data={data} onOpen={(key) => openList({ rfm_segment: key })} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Matrix data={data} onOpen={(r, f) => openList({ r_score: String(r), f_score: String(f) })} />
            <Movement data={data} />
          </div>
          <footer className="space-y-1 text-[11px] leading-5 text-faint">
            {data.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            {data.kpis.internal_accounts_excluded ? (
              <p>{formatNumber(data.kpis.internal_accounts_excluded)} حساب داخلی از این گزارش خارج شده است.</p>
            ) : null}
            <p>آخرین محاسبه: {formatDateTime(data.computed_at)}</p>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`bento-card glass-rim p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
}

function Kpis({ data }: { data: RfmSummary }) {
  const { kpis } = data;
  const items = [
    { label: "مشتریان فعال ۱۲ ماه", value: formatNumber(kpis.active_customers_12m), hint: "دست‌کم یک خرید در ۱۲ ماه اخیر" },
    { label: "نرخ خرید تکراری", value: formatPercent(kpis.repeat_rate_12m), hint: "دو خرید یا بیشتر در ۱۲ ماه، از مشتریان فعال" },
    { label: "میانگین خرید ۱۲ ماهه هر مشتری فعال", value: formatCompactToman(kpis.avg_amount_12m_per_active), hint: "خرید خالص مشتری" },
    { label: "ارزش در خطر", value: formatCompactToman(kpis.value_at_risk), hint: "خرید خالص کل «در خطر» و «نباید از دست برود»" },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Card key={item.label}>
            <div className="text-xs font-semibold text-muted">{item.label}</div>
            <div className="mt-2 text-2xl font-black text-ink tabular">{item.value}</div>
            <div className="mt-1 text-[11px] text-faint">{item.hint}</div>
          </Card>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        مشتری خریدار: <span className="font-bold text-ink tabular">{formatNumber(kpis.purchasing_customers)}</span>
        {" · "}
        ثبت‌نام بدون خرید: <span className="font-bold text-ink tabular">{formatNumber(kpis.registered_without_purchase)}</span>
      </p>
    </div>
  );
}

function SegmentsTable({ data, onOpen }: { data: RfmSummary; onOpen: (key: string) => void }) {
  return (
    <Card>
      <h3 className="mb-3 text-[15px] font-semibold text-ink">سگمنت‌ها</h3>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="px-2 py-2 font-semibold">سگمنت</th>
              <th className="px-2 py-2 font-semibold">مشتری</th>
              <th className="px-2 py-2 font-semibold">سهم از خرید خالص</th>
              <th className="px-2 py-2 font-semibold">خرید ۱۲ ماه</th>
              <th className="px-2 py-2 font-semibold">میانگین روز</th>
              <th className="px-2 py-2 font-semibold">میانگین خرید</th>
              <th className="px-2 py-2 font-semibold">پرارزش</th>
              <th className="px-2 py-2 font-semibold">اقدام پیشنهادی</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.segments.map((segment) => (
              <tr key={segment.key} className="hover:bg-hover">
                <td className="whitespace-nowrap px-2 py-2.5 font-bold text-ink">
                  <span className={`ml-1.5 inline-block h-2.5 w-2.5 rounded-full ${rfmSegment(segment.key)?.dot ?? "bg-line"}`} />
                  {segment.label}
                </td>
                <td className="px-2 py-2.5 tabular">
                  <div className="font-bold text-ink">{formatNumber(segment.count)}</div>
                  <div className="text-[10px] text-muted">{formatPercent(segment.pct_customers)}</div>
                </td>
                <td className="px-2 py-2.5">
                  <ShareBar pct={segment.pct_lifetime_amount} dot={rfmSegment(segment.key)?.dot} />
                </td>
                <td className="px-2 py-2.5 tabular">{formatCompactToman(segment.amount_12m_sum)}</td>
                <td className="px-2 py-2.5 tabular">{formatNumber(segment.avg_days_since_last)}</td>
                <td className="px-2 py-2.5 tabular">{formatNumber(segment.avg_purchase_count)}</td>
                <td className="px-2 py-2.5 tabular">{formatNumber(segment.high_value_count)}</td>
                <td className="px-2 py-2.5 text-muted">{segment.action}</td>
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpen(segment.key)}
                    disabled={!segment.count}
                    className="whitespace-nowrap rounded-xl bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-40"
                  >
                    مشاهده مشتریان
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2.5 md:hidden">
        {data.segments.map((segment) => (
          <div key={segment.key} className="space-y-2 rounded-2xl border border-line bg-elevated p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink">
                <span className={`ml-1.5 inline-block h-2.5 w-2.5 rounded-full ${rfmSegment(segment.key)?.dot ?? "bg-line"}`} />
                {segment.label}
              </span>
              <span className="text-xs text-muted tabular">
                {formatNumber(segment.count)} · {formatPercent(segment.pct_customers)}
              </span>
            </div>
            <ShareBar pct={segment.pct_lifetime_amount} dot={rfmSegment(segment.key)?.dot} />
            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted">
              <span>۱۲ ماه: <b className="text-ink">{formatCompactToman(segment.amount_12m_sum)}</b></span>
              <span>روز: <b className="text-ink tabular">{formatNumber(segment.avg_days_since_last)}</b></span>
              <span>پرارزش: <b className="text-ink tabular">{formatNumber(segment.high_value_count)}</b></span>
            </div>
            <p className="text-xs text-muted">{segment.action}</p>
            <button
              type="button"
              onClick={() => onOpen(segment.key)}
              disabled={!segment.count}
              className="w-full rounded-xl bg-accent/10 px-2.5 py-1.5 text-xs font-bold text-accent disabled:opacity-40"
            >
              مشاهده مشتریان
            </button>
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

function Matrix({ data, onOpen }: { data: RfmSummary; onOpen: (r: number, f: number) => void }) {
  const cells = new Map(data.matrix.map((cell) => [`${cell.r}-${cell.f}`, cell]));
  return (
    <Card>
      <h3 className="mb-1 text-[15px] font-semibold text-ink">ماتریس تازگی × تکرار</h3>
      <p className="mb-3 text-[11px] text-faint">ردیف‌ها {SCORE_LABELS.r} (۵ = تازه‌ترین)، ستون‌ها {SCORE_LABELS.f} (۵ = بیشترین خرید). روی هر خانه بزنید.</p>
      <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1 text-[11px]">
        <span />
        {SCORES.map((f) => (
          <span key={`f-${f}`} className="pb-1 text-center text-muted">
            {SCORE_LABELS.f} {formatNumber(f)}
          </span>
        ))}
        {SCORES.map((r) => (
          <div key={`r-${r}`} className="contents">
            <span className="flex items-center whitespace-nowrap pl-1.5 text-muted">
              {SCORE_LABELS.r} {formatNumber(r)}
            </span>
            {SCORES.map((f) => {
              const cell = cells.get(`${r}-${f}`);
              const segment = rfmSegment(cell?.segment ?? segmentForCell(r, f));
              return (
                <button
                  key={`${r}-${f}`}
                  type="button"
                  onClick={() => onOpen(r, f)}
                  disabled={!cell?.count}
                  title={segment?.label}
                  className={`flex h-12 flex-col items-center justify-center rounded-lg font-bold tabular transition-transform hover:scale-[1.03] disabled:cursor-default disabled:opacity-60 ${segment?.cell ?? "bg-hover"}`}
                >
                  {formatNumber(cell?.count ?? 0)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Movement({ data }: { data: RfmSummary }) {
  const movement = data.movement;
  return (
    <Card>
      <h3 className="mb-3 text-[15px] font-semibold text-ink">جابه‌جایی ماه گذشته</h3>
      {!movement ? (
        <p className="text-sm text-muted">برای گزارش جابه‌جایی دست‌کم دو عکس ماهانه لازم است.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-[11px] text-faint">
            {movement.previous_month} ← {movement.month} · خریدار تازه در این ماه:{" "}
            <b className="text-ink tabular">{formatNumber(movement.new_purchasers)}</b>
          </p>
          {movement.moves.length ? (
            <ul className="space-y-1.5">
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
        </div>
      )}
    </Card>
  );
}
