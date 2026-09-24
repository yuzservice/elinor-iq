import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerNameCell, Panel } from "../components/ui";
import {
  ChangePill,
  LegendDot,
  PeriodToggle,
  PillGroup,
  RevenueChart,
  SalesGauge,
  StatCard,
  StatIcons,
} from "../components/dashboard";
import { EmptyState, ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatNumber, formatToman } from "../lib/format";
import { homeService } from "../services/home";
import { salesService, type SalesLineFilter } from "../services/sales";
import type { HomeSummary } from "../types";

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
      return haystack.includes(query.trim().toLowerCase()) && (statusFilter === "all" || order.status === statusFilter);
    });
  }, [data?.recent_orders, query, statusFilter]);

  if (error && !data) return <ErrorState />;

  const gauge = buildGauge(board);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading && !board.length
          ? [0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-[148px] rounded-[24px]" />)
          : kpis.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                change={card.change}
                primary={card.primary}
                icon={<StatIcons name={card.icon} />}
              />
            ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.62fr_0.88fr]">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">بینش فروش</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="tabular text-[32px] font-semibold leading-none text-ink">
                  {formatNumber(points.reduce((sum, point) => sum + point.purchase_count, 0))}
                </div>
                <ChangePill value={kpis[0]?.change ?? null} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <PeriodToggle
                value={group}
                onChange={setGroup}
                options={[
                  { value: "daily", label: "روزانه" },
                  { value: "monthly", label: "ماهانه" },
                ]}
              />
              <div className="flex flex-wrap justify-end gap-4">
                <LegendDot color="#2D7FF9" label="خرید" />
                <LegendDot color="#7DD3A8" label="واحد" />
                <LegendDot color="#CBD5E1" label="مرجوعی" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <PillGroup value={salesLine} onChange={setSalesLine} options={SALES_LINES} />
          </div>
          <div className="mt-5">
            {trend.loading && !points.length ? <Skeleton className="h-[300px]" /> : trend.error ? <ErrorState /> : <RevenueChart points={points} />}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">نمای کلی فروش</h2>
            <span className="text-lg text-faint">⋯</span>
          </div>
          <SalesGauge {...gauge} formatValue={formatToman} />
        </Panel>
      </div>

      <Panel>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">فروش‌های اخیر</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جستجو"
              className="h-10 w-56 rounded-full border border-line bg-elevated px-4 text-sm outline-none"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-full border border-line bg-elevated px-4 text-sm outline-none"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="delivered">تحویل‌شده</option>
              <option value="wait_for_payment">در انتظار پرداخت</option>
              <option value="canceled">لغوشده</option>
            </select>
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
                <tr className="text-[12px] text-faint">
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
                    <tr key={order.id} className="border-b border-line/80">
                      <td className="ltr-iso px-3 py-4 tabular text-muted">#{order.id}</td>
                      <td className="px-3 py-4 text-muted">{formatDate(order.created_at)}</td>
                      <td className="px-3 py-4">
                        {order.customer_id ? (
                          <Link to={`/customers/${order.customer_id}`}>
                            <CustomerNameCell name={display.name} fallback={display.fallback} sourceId={order.customer_id} />
                          </Link>
                        ) : (
                          <CustomerNameCell name={display.name} fallback={display.fallback} />
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <StatusPill status={order.status} label={order.status_label} />
                      </td>
                      <td className="px-3 py-4 tabular font-medium">{formatToman(order.total_amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function buildKpis(board: NonNullable<HomeSummary["line_board"]>) {
  const purchases = aggregate(board, "purchase_count");
  const customers = aggregate(board, "customer_count");
  const returning = aggregate(board, "repeat_customers");
  const online = board.find((line) => line.key === "ONLINE");
  return [
    { label: "کل خرید", value: formatNumber(purchases.current), change: purchases.change, icon: "bag" as const, primary: true },
    { label: "مشتریان", value: formatNumber(customers.current), change: customers.change, icon: "people" as const },
    {
      label: "درآمد آنلاین",
      value: formatNumber(online?.order_value || 0),
      change: pct(online?.order_value || 0, online?.previous?.order_value || 0),
      icon: "money" as const,
    },
    { label: "مشتری تکراری", value: formatNumber(returning.current), change: returning.change, icon: "user" as const },
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

function StatusPill({ status, label }: { status: string; label: string }) {
  const styles =
    status === "delivered"
      ? "bg-[#E7F7EF] text-[#22A06B]"
      : status === "canceled" || status === "failed" || status === "canceled_by_user"
        ? "bg-[#FEE2E2] text-[#DC2626]"
        : status === "wait_for_payment"
          ? "bg-[#FFF4E5] text-[#E56910]"
          : "bg-[#EAE6FF] text-[#6E5DC6]";
  return <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${styles}`}>{label}</span>;
}
