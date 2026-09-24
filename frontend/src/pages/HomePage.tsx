import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, Panel, SectionHeader, StatusBadge } from "../components/ui";
import { CustomerNameCell } from "../components/ui";
import { EmptyState, ErrorState, Skeleton, Table, TableRow } from "../components/Table";
import { TrendChart } from "../components/TrendChart";
import { useApi } from "../hooks/useApi";
import { customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatNumber, formatToman } from "../lib/format";
import { homeService } from "../services/home";
import { salesService, type SalesLineFilter } from "../services/sales";
import type { SalesLineKey } from "../types";

const TREND_LINES: { value: SalesLineFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "ONLINE", label: "آنلاین" },
  { value: "SARI", label: "ساری" },
  { value: "GORGAN", label: "گرگان" },
  { value: "CAPRI", label: "کاپری" },
];

const LINE_TONE: Record<SalesLineKey, string> = {
  ONLINE: "bg-accent",
  SARI: "bg-sage",
  GORGAN: "bg-warning",
  CAPRI: "bg-rose",
};

export function HomePage() {
  const [salesLine, setSalesLine] = useState<SalesLineFilter>("all");
  const { data, loading, error } = useApi(() => homeService.summary(), []);
  const trend = useApi(
    () => salesService.summary(undefined, undefined, salesLine, "daily", "trend"),
    [salesLine],
  );

  if (error && !data) return <ErrorState />;

  return (
    <div>
      <PageHeader title="خانه" description={data?.window.label} />

      <Panel>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <SectionHeader title="روند فروش" hint="خریدهای معتبر — خط فروش را انتخاب کنید" />
          <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-elevated p-1" role="group" aria-label="خط فروش">
            {TREND_LINES.map((option) => {
              const selected = salesLine === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSalesLine(option.value)}
                  className={`h-8 rounded-lg px-3 text-xs transition-colors ${
                    selected ? "bg-accent text-on-accent" : "text-muted hover:bg-hover hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        {trend.loading && !trend.data?.trend ? (
          <Skeleton className="h-72" />
        ) : trend.error || !trend.data?.trend ? (
          <ErrorState />
        ) : (
          <TrendChart points={trend.data.trend.points} metric="purchase_count" />
        )}
      </Panel>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading && !data?.line_board ? (
          <>
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </>
        ) : null}
        {(data?.line_board || []).map((line) => (
          <article key={line.key} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
            <div className={`h-1 ${LINE_TONE[line.key]}`} />
            <div className="px-5 py-5">
              <div className="text-xs text-muted">{line.label}</div>
              <div className="mt-3 flex items-baseline gap-2">
                <div className="tabular text-[32px] font-medium tracking-tight text-ink">
                  {formatNumber(line.purchase_count)}
                </div>
                <div className="text-xs text-faint">خرید</div>
              </div>
              {line.order_value != null ? (
                <div className="mt-1 text-sm text-muted">{formatToman(line.order_value)}</div>
              ) : (
                <div className="mt-1 text-sm text-faint">درآمد حضوری جدا حساب نمی‌شود</div>
              )}
              <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                <div>
                  <dt className="text-[11px] text-faint">مشتری</dt>
                  <dd className="mt-1 tabular text-sm text-ink">{formatNumber(line.customer_count)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-faint">واحد</dt>
                  <dd className="mt-1 tabular text-sm text-ink">{formatNumber(line.units_sold)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-faint">میانگین</dt>
                  <dd className="mt-1 tabular text-sm text-ink">{formatNumber(line.avg_units_per_purchase)}</dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </div>
      {data ? (
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <Panel>
          <SectionHeader title="فعالیت اخیر فروش" />
          {data.recent_orders?.length ? (
            <Table columns={["تاریخ", "سفارش", "مشتری", "وضعیت", "مبلغ"]}>
              {data.recent_orders.map((order) => {
                const display = customerDisplayName(order);
                return (
                  <TableRow key={order.id}>
                    <td className="px-3 py-3.5 text-muted">{formatDate(order.created_at)}</td>
                    <td className="ltr-iso px-3 py-3.5 tabular">{order.id}</td>
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
                      <StatusBadge status={order.status} label={order.status_label} />
                    </td>
                    <td className="px-3 py-3.5 tabular">{formatToman(order.total_amount)}</td>
                  </TableRow>
                );
              })}
            </Table>
          ) : (
            <EmptyState title="سفارش اخیری در این بازه نیست." />
          )}
        </Panel>
        <Panel>
          <SectionHeader title="نیاز به توجه" />
          <div className="space-y-3 text-sm leading-7 text-muted">
            {(data.needs_attention.items || [data.needs_attention.message]).map((item) => (
              <div key={item} className="rounded-xl bg-hover px-4 py-3">
                {item}
              </div>
            ))}
            <Link to="/customers" className="inline-block text-accent">
              مشاهده مشتریان
            </Link>
          </div>
        </Panel>
      </div>
      ) : null}
    </div>
  );
}
