import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerNameCell } from "../components/ui";
import { EmptyState, ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatNumber, formatToman } from "../lib/format";
import { homeService } from "../services/home";
import { salesService, type SalesLineFilter } from "../services/sales";
import type { HomeSummary, SalesLineKey, SalesTrendPoint } from "../types";

const TREND_LINES: { value: SalesLineFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "ONLINE", label: "آنلاین" },
  { value: "SARI", label: "ساری" },
  { value: "GORGAN", label: "گرگان" },
  { value: "CAPRI", label: "کاپری" },
];

const LINE_COLOR: Record<SalesLineKey, string> = {
  ONLINE: "#3b82f6",
  SARI: "#60a5fa",
  GORGAN: "#93c5fd",
  CAPRI: "#bfdbfe",
};

export function HomePage() {
  const [salesLine, setSalesLine] = useState<SalesLineFilter>("all");
  const [group, setGroup] = useState<"daily" | "monthly">("monthly");
  const [query, setQuery] = useState("");
  const { data, loading, error } = useApi(() => homeService.summary(), []);
  const trend = useApi(
    () => salesService.summary(undefined, undefined, salesLine, group, "trend"),
    [salesLine, group],
  );

  const board = data?.line_board || [];
  const cards = useMemo(() => headlineCards(board), [board]);
  const orders = (data?.recent_orders || []).filter((order) => {
    const display = customerDisplayName(order);
    const haystack = `${order.id} ${display.name} ${order.status_label}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  if (error && !data) return <ErrorState />;

  const points = trend.data?.trend?.points || [];
  const peak = points.reduce((best, point) => (point.purchase_count > best.purchase_count ? point : best), points[0]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading && !board.length
          ? [0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-36 rounded-3xl" />)
          : cards.map((card) => <KpiCard key={card.label} {...card} />)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_0.9fr]">
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-ink">روند فروش</h2>
              <div className="mt-3 flex items-baseline gap-3">
                <div className="tabular text-3xl font-medium tracking-tight text-ink">
                  {formatNumber(points.reduce((sum, point) => sum + point.purchase_count, 0))}
                </div>
                <span className="text-xs text-faint">خرید معتبر</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full bg-hover p-1">
                {(
                  [
                    ["daily", "روزانه"],
                    ["monthly", "ماهانه"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGroup(value)}
                    className={`rounded-full px-3 py-1.5 text-xs ${
                      group === value ? "bg-ink text-canvas" : "text-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1">
            {TREND_LINES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={salesLine === option.value}
                onClick={() => setSalesLine(option.value)}
                className={`rounded-full px-3 py-1 text-xs ${
                  salesLine === option.value ? "bg-accent text-on-accent" : "text-muted hover:bg-hover"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            {trend.loading && !points.length ? (
              <Skeleton className="h-64" />
            ) : trend.error ? (
              <ErrorState />
            ) : (
              <BarChart points={points} peakLabel={peak ? formatNumber(peak.purchase_count) : ""} />
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-medium text-ink">سهم خطوط فروش</h2>
          <ShareGauge lines={board} />
        </section>
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">فروش‌های اخیر</h2>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جستجو"
            className="h-10 w-56 rounded-full border border-line bg-canvas px-4 text-sm outline-none"
          />
        </div>
        {!data ? (
          <Skeleton className="h-64" />
        ) : orders.length === 0 ? (
          <EmptyState title="سفارشی برای این جستجو نیست." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-xs text-faint">
                  {["شناسه", "تاریخ", "مشتری", "وضعیت", "مبلغ"].map((column) => (
                    <th key={column} className="border-b border-line px-3 py-3 text-right font-normal">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const display = customerDisplayName(order);
                  return (
                    <tr key={order.id} className="border-b border-line/70 last:border-0">
                      <td className="ltr-iso px-3 py-3.5 tabular text-muted">{order.id}</td>
                      <td className="px-3 py-3.5 text-muted">{formatDate(order.created_at)}</td>
                      <td className="px-3 py-3.5">
                        {order.customer_id ? (
                          <Link to={`/customers/${order.customer_id}`} className="hover:text-accent">
                            <CustomerNameCell name={display.name} fallback={display.fallback} sourceId={order.customer_id} />
                          </Link>
                        ) : (
                          <CustomerNameCell name={display.name} fallback={display.fallback} />
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <StatusPill status={order.status} label={order.status_label} />
                      </td>
                      <td className="px-3 py-3.5 tabular">{formatToman(order.total_amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function headlineCards(board: NonNullable<HomeSummary["line_board"]>): Kpi[] {
  const purchases = sum(board, "purchase_count");
  const customers = sum(board, "customer_count");
  const returning = sum(board, "repeat_customers");
  const online = board.find((line) => line.key === "ONLINE");
  return [
    { label: "کل خرید", value: formatNumber(purchases.current), change: purchases.change, icon: "bag" },
    { label: "مشتریان", value: formatNumber(customers.current), change: customers.change, icon: "people" },
    {
      label: "فروش آنلاین",
      value: formatNumber(online?.order_value || 0),
      suffix: "تومان",
      change: changeOf(online?.order_value || 0, online?.previous?.order_value || 0),
      icon: "money",
    },
    { label: "مشتری تکراری", value: formatNumber(returning.current), change: returning.change, icon: "user" },
  ];
}

function sum(
  board: NonNullable<HomeSummary["line_board"]>,
  key: "purchase_count" | "customer_count" | "repeat_customers",
) {
  const current = board.reduce((total, line) => total + (line[key] || 0), 0);
  const previous = board.reduce((total, line) => total + (line.previous?.[key] || 0), 0);
  return { current, change: changeOf(current, previous) };
}

function changeOf(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

type Kpi = { label: string; value: string; suffix?: string; change: number | null; icon: "bag" | "people" | "money" | "user" };

function KpiCard({ label, value, suffix, change, icon }: Kpi) {
  const up = (change || 0) >= 0;
  return (
    <article className="rounded-3xl border border-line bg-surface px-5 py-4 shadow-soft">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${icon === "bag" ? "bg-[#3b82f6] text-white" : "bg-hover text-muted"}`}>
          <CardIcon name={icon} />
        </span>
        <div className="text-sm font-medium text-ink">{label}</div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <div className="tabular text-[32px] font-medium leading-none tracking-tight text-ink">{value}</div>
        {suffix ? <span className="text-xs text-faint">{suffix}</span> : null}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-faint">
        {change == null ? (
          <span>بازه قبلی برای مقایسه کافی نیست</span>
        ) : (
          <>
            <span className={`rounded-full px-2 py-0.5 tabular ${up ? "bg-sage/15 text-sage" : "bg-rose/15 text-rose"}`}>
              {up ? "↑" : "↓"} {formatNumber(Math.abs(change))}٪
            </span>
            <span>نسبت به بازه قبل</span>
          </>
        )}
      </div>
    </article>
  );
}

function CardIcon({ name }: { name: Kpi["icon"] }) {
  const common = "h-4 w-4";
  if (name === "people") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1" />
        <circle cx="10" cy="8" r="3" />
        <path d="M20 19v-1a3 3 0 0 0-2.2-2.9M16 5.1a3 3 0 0 1 0 5.8" />
      </svg>
    );
  }
  if (name === "money") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3S7.5 5.8 7.5 7.5 9.5 10.5 12 10.5s4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 8h12l-1 11H7L6 8Z" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" />
    </svg>
  );
}

function BarChart({ points, peakLabel }: { points: SalesTrendPoint[]; peakLabel: string }) {
  if (!points.length) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted">اطلاعاتی برای این بازه پیدا نشد.</div>;
  }
  const max = Math.max(...points.map((point) => point.purchase_count), 1);
  const peakIndex = points.findIndex((point) => point.purchase_count === max);
  return (
    <div className="flex h-64 items-end gap-2" dir="ltr">
      {points.map((point, index) => {
        const height = Math.max(8, (point.purchase_count / max) * 100);
        const active = index === peakIndex;
        return (
          <div key={`${point.date}-${index}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            {active ? (
              <div className="mb-1 self-center rounded-md bg-[#3b82f6] px-1.5 py-0.5 text-[10px] text-white">{peakLabel}</div>
            ) : (
              <div className="mb-1 h-5" />
            )}
            <div
              className={`w-full rounded-t-lg ${active ? "bg-gradient-to-t from-[#93c5fd] to-[#2563eb]" : "bg-[repeating-linear-gradient(135deg,#e5e7eb,#e5e7eb_4px,#f3f4f6_4px,#f3f4f6_8px)]"}`}
              style={{ height: `${height}%` }}
              title={point.date_label || point.date}
            />
            <div className="mt-2 truncate text-center text-[10px] text-faint" dir="rtl">
              {point.date_label || point.date.slice(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShareGauge({ lines }: { lines: NonNullable<HomeSummary["line_board"]> }) {
  const total = lines.reduce((sum, line) => sum + line.purchase_count, 0);
  const top = [...lines].sort((a, b) => b.purchase_count - a.purchase_count)[0];
  const share = total && top ? Math.round((top.purchase_count / total) * 1000) / 10 : 0;
  let cursor = 0;
  const arcs = lines.map((line) => {
    const portion = total ? line.purchase_count / total : 0;
    const start = cursor;
    cursor += portion;
    return { key: line.key, start, end: cursor, color: LINE_COLOR[line.key] };
  });
  return (
    <div className="flex h-full flex-col">
      <svg viewBox="0 0 200 120" className="mx-auto mt-4 w-full max-w-[280px]">
        {arcs.map((arc) => (
          <path key={arc.key} d={arcPath(arc.start, arc.end)} fill="none" stroke={arc.color} strokeWidth="16" strokeLinecap="butt" />
        ))}
        {!total ? <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--border)" strokeWidth="16" /> : null}
      </svg>
      <div className="-mt-8 text-center">
        <div className="tabular text-3xl font-medium text-ink">{formatNumber(share)}٪</div>
        <div className="mt-1 text-xs text-faint">{top ? top.label : "سهم خرید"}</div>
      </div>
      <div className="mt-6 space-y-2">
        {lines.map((line) => (
          <div key={line.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: LINE_COLOR[line.key] }} />
              {line.label}
            </span>
            <span className="tabular text-ink">{formatNumber(line.purchase_count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function arcPath(start: number, end: number) {
  const a0 = Math.PI * (1 - start);
  const a1 = Math.PI * (1 - end);
  const r = 80;
  const cx = 100;
  const cy = 100;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy - r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy - r * Math.sin(a1);
  const large = end - start > 0.5 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 0 ${x1} ${y1}`;
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "delivered"
      ? "bg-sage/15 text-sage"
      : status === "canceled" || status === "failed" || status === "canceled_by_user"
        ? "bg-rose/15 text-rose"
        : status === "wait_for_payment"
          ? "bg-warning/15 text-warning"
          : "bg-[#3b82f6]/10 text-[#3b82f6]";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] ${tone}`}>{label}</span>;
}
