import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerNameCell } from "../components/ui";
import { EmptyState, ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatNumber, formatToman } from "../lib/format";
import { homeService } from "../services/home";
import { salesService, type SalesLineFilter } from "../services/sales";
import type { HomeSummary, SalesTrendPoint } from "../types";

const C = {
  bg: "#E8EEF5",
  card: "#FFFFFF",
  ink: "#111827",
  muted: "#6B7280",
  faint: "#9CA3AF",
  border: "#E5E7EB",
  blue: "#2D7FF9",
  blueDark: "#1D4ED8",
  blueLight: "#93C5FD",
  greenBg: "#E7F7EF",
  green: "#22A06B",
  orangeBg: "#FFF4E5",
  orange: "#E56910",
  purpleBg: "#EAE6FF",
  purple: "#6E5DC6",
};

const SALES_LINES: { value: SalesLineFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "ONLINE", label: "آنلاین" },
  { value: "SARI", label: "ساری" },
  { value: "GORGAN", label: "گرگان" },
  { value: "CAPRI", label: "کاپری" },
];

export function HomePage() {
  const [salesLine, setSalesLine] = useState<SalesLineFilter>("all");
  const [group, setGroup] = useState<"daily" | "monthly">("monthly");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { data, loading, error } = useApi(() => homeService.summary(), []);
  const trend = useApi(
    () => salesService.summary(undefined, undefined, salesLine, group, "trend"),
    [salesLine, group],
  );

  const board = data?.line_board || [];
  const kpis = useMemo(() => buildKpis(board), [board]);
  const points = useMemo(() => (trend.data?.trend?.points || []).slice(-12), [trend.data]);
  const orders = useMemo(() => {
    return (data?.recent_orders || []).filter((order) => {
      const display = customerDisplayName(order);
      const haystack = `${order.id} ${display.name} ${order.status_label}`.toLowerCase();
      const matchesQuery = haystack.includes(query.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [data?.recent_orders, query, statusFilter]);

  if (error && !data) return <ErrorState />;

  const totalPurchases = points.reduce((sum, point) => sum + point.purchase_count, 0);
  const purchaseChange = kpis[0]?.change;
  const gauge = buildGauge(board);

  return (
    <div className="dash-home -mx-8 -mt-8 min-h-full px-8 py-8 lg:-mx-10 lg:px-10" style={{ background: C.bg }}>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {loading && !board.length
          ? [0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-[148px] rounded-[24px]" />)
          : kpis.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.62fr_0.88fr]">
        <section className="dash-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold" style={{ color: C.ink }}>
                بینش فروش
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="tabular text-[32px] font-semibold leading-none" style={{ color: C.ink }}>
                  {formatNumber(totalPurchases)}
                </div>
                <ChangePill value={purchaseChange} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <PeriodToggle value={group} onChange={setGroup} />
              <div className="flex flex-wrap justify-end gap-4 text-[11px]" style={{ color: C.muted }}>
                <LegendDot color={C.blue} label="خرید" />
                <LegendDot color="#7DD3A8" label="واحد" />
                <LegendDot color="#CBD5E1" label="مرجوعی" />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {SALES_LINES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSalesLine(option.value)}
                className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: salesLine === option.value ? C.blue : "#F3F4F6",
                  color: salesLine === option.value ? "#FFFFFF" : C.muted,
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-5">
            {trend.loading && !points.length ? (
              <Skeleton className="h-[300px]" />
            ) : trend.error ? (
              <ErrorState />
            ) : (
              <RevenueChart points={points} />
            )}
          </div>
        </section>

        <section className="dash-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold" style={{ color: C.ink }}>
              نمای کلی فروش
            </h2>
            <button type="button" className="text-lg leading-none" style={{ color: C.faint }} aria-label="گزینه‌ها">
              ⋯
            </button>
          </div>
          <SalesGauge {...gauge} />
        </section>
      </div>

      <section className="dash-card mt-5 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold" style={{ color: C.ink }}>
            فروش‌های اخیر
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-full border px-4 text-sm" style={{ borderColor: C.border, background: C.card, color: C.muted }}>
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="جستجو"
                className="w-36 bg-transparent outline-none"
                style={{ color: C.ink }}
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-full border px-4 text-sm outline-none"
              style={{ borderColor: C.border, background: C.card, color: C.muted }}
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="delivered">تحویل‌شده</option>
              <option value="wait_for_payment">در انتظار پرداخت</option>
              <option value="canceled">لغوشده</option>
            </select>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-full border px-4 text-sm"
              style={{ borderColor: C.border, background: C.card, color: C.muted }}
            >
              <FilterIcon />
              فیلتر
            </button>
          </div>
        </div>
        {!data ? (
          <Skeleton className="h-72" />
        ) : orders.length === 0 ? (
          <EmptyState title="سفارشی پیدا نشد." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-[12px]" style={{ color: C.faint }}>
                  <th className="pb-3 pl-2 font-normal">
                    <span className="inline-block h-4 w-4 rounded border" style={{ borderColor: C.border }} />
                  </th>
                  {["شناسه", "تاریخ", "مشتری", "وضعیت", "اقلام", "مبلغ"].map((column) => (
                    <th key={column} className="pb-3 px-3 text-right font-normal">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const display = customerDisplayName(order);
                  return (
                    <tr key={order.id} className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-4 pl-2">
                        <span className="inline-block h-4 w-4 rounded border" style={{ borderColor: C.border }} />
                      </td>
                      <td className="ltr-iso px-3 py-4 tabular" style={{ color: C.muted }}>
                        #{order.id}
                      </td>
                      <td className="px-3 py-4" style={{ color: C.muted }}>
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-3 py-4" style={{ color: C.ink }}>
                        {order.customer_id ? (
                          <Link to={`/customers/${order.customer_id}`} style={{ color: C.ink }}>
                            <CustomerNameCell name={display.name} fallback={display.fallback} sourceId={order.customer_id} />
                          </Link>
                        ) : (
                          <CustomerNameCell name={display.name} fallback={display.fallback} />
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <StatusPill status={order.status} label={order.status_label} />
                      </td>
                      <td className="px-3 py-4 tabular" style={{ color: C.muted }}>
                        ۱ مورد
                      </td>
                      <td className="px-3 py-4 tabular font-medium" style={{ color: C.ink }}>
                        {formatToman(order.total_amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`
        .dash-home .dash-card {
          background: ${C.card};
          border-radius: 24px;
          box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
        }
      `}</style>
    </div>
  );
}

type Kpi = {
  label: string;
  value: string;
  change: number | null;
  icon: "bag" | "people" | "money" | "user";
  primary?: boolean;
};

function buildKpis(board: NonNullable<HomeSummary["line_board"]>): Kpi[] {
  const purchases = aggregate(board, "purchase_count");
  const customers = aggregate(board, "customer_count");
  const returning = aggregate(board, "repeat_customers");
  const online = board.find((line) => line.key === "ONLINE");
  return [
    { label: "کل خرید", value: formatNumber(purchases.current), change: purchases.change, icon: "bag", primary: true },
    { label: "مشتریان", value: formatNumber(customers.current), change: customers.change, icon: "people" },
    {
      label: "درآمد آنلاین",
      value: formatNumber(online?.order_value || 0),
      change: pct(online?.order_value || 0, online?.previous?.order_value || 0),
      icon: "money",
    },
    { label: "مشتری تکراری", value: formatNumber(returning.current), change: returning.change, icon: "user" },
  ];
}

function aggregate(board: NonNullable<HomeSummary["line_board"]>, key: "purchase_count" | "customer_count" | "repeat_customers") {
  const current = board.reduce((sum, line) => sum + (line[key] || 0), 0);
  const previous = board.reduce((sum, line) => sum + (line.previous?.[key] || 0), 0);
  return { current, change: pct(current, previous) };
}

function pct(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function buildGauge(board: NonNullable<HomeSummary["line_board"]>) {
  const current = board.reduce((sum, line) => sum + line.purchase_count, 0);
  const previous = board.reduce((sum, line) => sum + (line.previous?.purchase_count || 0), 0);
  const online = board.find((line) => line.key === "ONLINE");
  const salesValue = online?.order_value || 0;
  const target = Math.max((online?.previous?.order_value || 0) * 1.4, salesValue, 1);
  const growth = previous > 0 ? Math.min(100, Math.round((current / previous) * 1000) / 10) : 0;
  const progress = Math.min(100, Math.round((salesValue / target) * 1000) / 10);
  return { growth, salesValue, target, progress };
}

function StatCard({ label, value, change, icon, primary }: Kpi) {
  return (
    <article className="dash-card px-5 py-5">
      <div className="flex items-start justify-between">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: primary ? C.blue : "#F3F4F6",
            color: primary ? "#FFFFFF" : C.muted,
          }}
        >
          <CardIcon name={icon} />
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]" style={{ background: "#F3F4F6", color: C.faint }}>
          i
        </span>
      </div>
      <div className="mt-4 text-[13px] font-medium" style={{ color: C.ink }}>
        {label}
      </div>
      <div className="mt-2 tabular text-[34px] font-semibold leading-none tracking-tight" style={{ color: C.ink }}>
        {value}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: C.faint }}>
        <ChangePill value={change} />
        <span>نسبت به بازه قبل:</span>
      </div>
    </article>
  );
}

function ChangePill({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span
      className="rounded-full px-2 py-0.5 tabular text-[11px] font-medium"
      style={{ background: C.greenBg, color: C.green }}
    >
      {up ? "↑" : "↓"} {formatNumber(Math.abs(value))}٪
    </span>
  );
}

function PeriodToggle({ value, onChange }: { value: "daily" | "monthly"; onChange: (value: "daily" | "monthly") => void }) {
  return (
    <div className="flex rounded-full p-1" style={{ background: "#F3F4F6" }}>
      {(
        [
          ["daily", "روزانه"],
          ["monthly", "ماهانه"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className="rounded-full px-4 py-1.5 text-[12px] font-medium"
          style={{
            background: value === key ? C.ink : "transparent",
            color: value === key ? "#FFFFFF" : C.muted,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function RevenueChart({ points }: { points: SalesTrendPoint[] }) {
  if (!points.length) {
    return <div className="flex h-[300px] items-center justify-center text-sm" style={{ color: C.muted }}>اطلاعاتی برای این بازه پیدا نشد.</div>;
  }
  const width = 760;
  const height = 300;
  const padL = 42;
  const padR = 12;
  const padT = 36;
  const padB = 34;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...points.map((point) => point.purchase_count), 1);
  const peakIndex = points.reduce((best, point, index) => (point.purchase_count > points[best].purchase_count ? index : best), 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(max * ratio));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full" dir="ltr">
      <defs>
        <pattern id="dash-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="8" fill="#E5E7EB" />
          <rect x="4" width="4" height="8" fill="#F3F4F6" />
        </pattern>
        <linearGradient id="dash-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor={C.blue} />
        </linearGradient>
      </defs>
      {ticks.map((tick) => {
        const y = padT + chartH - (tick / max) * chartH;
        return (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#E5E7EB" strokeDasharray="4 6" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill={C.faint}>
              {tick >= 1000 ? `${Math.round(tick / 1000)}k` : tick}
            </text>
          </g>
        );
      })}
      {points.map((point, index) => {
        const slot = chartW / points.length;
        const barW = Math.min(28, slot * 0.52);
        const x = padL + index * slot + (slot - barW) / 2;
        const barH = Math.max(10, (point.purchase_count / max) * chartH);
        const y = padT + chartH - barH;
        const active = index === peakIndex;
        return (
          <g key={`${point.date}-${index}`}>
            {active ? (
              <>
                <rect x={x + barW / 2 - 34} y={y - 28} width="68" height="22" rx="8" fill={C.blue} />
                <text x={x + barW / 2} y={y - 13} textAnchor="middle" fontSize="10" fill="#FFFFFF">
                  {formatNumber(point.purchase_count)}
                </text>
                <circle cx={x + barW / 2} cy={y - 4} r="3" fill="#FFFFFF" />
              </>
            ) : null}
            <rect x={x} y={y} width={barW} height={barH} rx={barW / 2} fill={active ? "url(#dash-bar)" : "url(#dash-stripes)"} />
            <text x={x + barW / 2} y={height - 10} textAnchor="middle" fontSize="10" fill={C.faint}>
              {(point.date_label || point.date).slice(0, 6)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SalesGauge({
  growth,
  salesValue,
  target,
  progress,
}: {
  growth: number;
  salesValue: number;
  target: number;
  progress: number;
}) {
  const segments = 20;
  const filled = Math.round((growth / 100) * segments);
  return (
    <div className="flex h-full flex-col">
      <div className="relative mx-auto mt-2 w-full max-w-[300px]">
        <svg viewBox="0 0 220 130" className="w-full">
          {Array.from({ length: segments }).map((_, index) => {
            const angle = Math.PI + (index / (segments - 1)) * Math.PI;
            const inner = 58;
            const outer = 78;
            const cx = 110;
            const cy = 108;
            const x1 = cx + inner * Math.cos(angle);
            const y1 = cy + inner * Math.sin(angle);
            const x2 = cx + outer * Math.cos(angle);
            const y2 = cy + outer * Math.sin(angle);
            const active = index < filled;
            const tone = active ? `rgba(45, 127, 249, ${0.45 + (index / segments) * 0.55})` : "#E5E7EB";
            return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone} strokeWidth="7" strokeLinecap="round" />;
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-8 text-center">
          <div className="tabular text-[34px] font-semibold leading-none" style={{ color: C.ink }}>
            {formatNumber(growth)}٪
          </div>
          <div className="mt-2 text-[12px]" style={{ color: C.muted }}>
            رشد فروش
          </div>
        </div>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-[12px]" style={{ color: C.muted }}>
          <span>فروش {formatToman(salesValue)}</span>
          <span>هدف {formatToman(target)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "#E5E7EB" }}>
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: C.blue }} />
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const styles =
    status === "delivered"
      ? { background: C.greenBg, color: C.green }
      : status === "canceled" || status === "failed" || status === "canceled_by_user"
        ? { background: "#FEE2E2", color: "#DC2626" }
        : status === "wait_for_payment"
          ? { background: C.orangeBg, color: C.orange }
          : { background: C.purpleBg, color: C.purple };
  return (
    <span className="rounded-full px-3 py-1 text-[11px] font-medium" style={styles}>
      {label}
    </span>
  );
}

function CardIcon({ name }: { name: Kpi["icon"] }) {
  const common = "h-[18px] w-[18px]";
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  );
}
