import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerNameCell, Panel } from "../components/ui";
import {
  ChangePill,
  HomePeriodToggle,
  MetricCardIcons,
  MetricSquareCard,
  PeriodToggle,
  PillGroup,
  RevenueChart,
  SalesGauge,
} from "../components/dashboard";
import { EmptyState, ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatToman, toInputDate } from "../lib/format";
import { homeService } from "../services/home";
import { salesService, type SalesLineFilter } from "../services/sales";
import type { HomePeriod, HomeSummary } from "../types";

const SALES_LINES: { value: SalesLineFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "ONLINE", label: "آنلاین" },
  { value: "SARI", label: "ساری" },
  { value: "GORGAN", label: "گرگان" },
  { value: "CAPRI", label: "کاپری" },
];

export function HomePage() {
  const [period, setPeriod] = useState<HomePeriod>("month");
  const [salesLine, setSalesLine] = useState<SalesLineFilter>("all");
  const [group, setGroup] = useState<"daily" | "monthly">("monthly");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { data, loading, error } = useApi(() => homeService.summary(period), [period]);
  const range = useMemo(
    () => ({
      from: data ? toInputDate(data.window.start) : "",
      to: data ? toInputDate(data.window.end) : "",
    }),
    [data],
  );
  const trend = useApi(
    () => salesService.summary(range.from, range.to, salesLine, group, "trend"),
    [range.from, range.to, salesLine, group],
    Boolean(range.from && range.to),
  );

  const orders = useMemo(() => {
    return (data?.recent_orders || []).filter((order) => {
      const display = customerDisplayName(order);
      const haystack = `${order.id} ${display.name} ${order.status_label}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase()) && (statusFilter === "all" || order.status === statusFilter);
    });
  }, [data?.recent_orders, query, statusFilter]);

  if (error && !data) return <ErrorState />;

  const points = (trend.data?.trend?.points || []).slice(-12);
  const gauge = buildGauge(data?.metric_cards || []);
  const salesAmountCard = data?.metric_cards?.find((card) => card.key === "sales_amount");
  const trendAmountTotal = points.reduce((sum, point) => sum + (point.amount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-ink">خلاصه فروش</h1>
          {data?.window.label ? <p className="mt-1 text-[13px] text-muted">{data.window.label}</p> : null}
        </div>
        <HomePeriodToggle value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {loading && !data?.metric_cards?.length
          ? [0, 1, 2, 3].map((item) => <Skeleton key={item} className="min-h-[280px] rounded-[24px]" />)
          : (data?.metric_cards || []).map((card) => (
              <MetricSquareCard key={card.key} card={card} icon={<MetricCardIcons name={card.kind} />} />
            ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.62fr_0.88fr]">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">بینش فروش</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="tabular text-[32px] font-semibold leading-none text-ink">
                  {formatToman(trendAmountTotal)}
                </div>
                <ChangePill value={salesAmountCard?.change_pct ?? null} />
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
            </div>
          </div>
          <div className="mt-4">
            <PillGroup value={salesLine} onChange={setSalesLine} options={SALES_LINES} />
          </div>
          <div className="mt-5">
            {trend.loading && !points.length ? (
              <Skeleton className="h-[300px]" />
            ) : trend.error ? (
              <ErrorState />
            ) : (
              <RevenueChart points={points} metric="amount" />
            )}
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

function buildGauge(cards: HomeSummary["metric_cards"]) {
  const sales = cards.find((card) => card.key === "sales_amount");
  const units = cards.find((card) => card.key === "units_sold");
  const salesValue = sales?.total || 0;
  const target = Math.max(Math.round(salesValue * 1.4), 1);
  const growth = sales?.change_pct != null ? Math.min(100, Math.max(0, 50 + sales.change_pct)) : 0;
  const progress = Math.min(100, Math.round((salesValue / target) * 1000) / 10);
  const unitsTotal = units?.total || 0;
  void unitsTotal;
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
