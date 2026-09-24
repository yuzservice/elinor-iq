import { Link } from "react-router-dom";
import { Metric, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "../components/ui";
import { CustomerNameCell } from "../components/ui";
import { EmptyState, ErrorState, Skeleton, Table, TableRow } from "../components/Table";
import { TrendChart } from "../components/TrendChart";
import { useApi } from "../hooks/useApi";
import { customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatNumber, formatToman } from "../lib/format";
import { homeService } from "../services/home";

export function HomePage() {
  const { data, loading, error } = useApi(() => homeService.summary(), []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (error || !data) return <ErrorState />;

  const empty = data.metrics.orders === 0;

  return (
    <div>
      <PageHeader title="خانه" description={data.window.label} />
      <MetricStrip>
        <Metric label="فروش" value={formatNumber(data.metrics.sales)} suffix="تومان" />
        <Metric label="سفارش‌ها" value={formatNumber(data.metrics.orders)} />
        <Metric label="مشتریان" value={formatNumber(data.metrics.customers)} />
        <Metric label="کالای فروخته‌شده" value={formatNumber(data.metrics.items_sold)} />
      </MetricStrip>
      {empty ? (
        <div className="mt-8">
          <EmptyState
            title="اطلاعاتی برای این بازه پیدا نشد."
            body="پس از همگام‌سازی، فروش و سفارش‌ها اینجا دیده می‌شوند."
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
          <Panel>
            <SectionHeader title="روند فروش" hint="سفارش‌های معتبر وب‌سایت" />
            <TrendChart points={data.trend} />
          </Panel>
          <Panel>
            <SectionHeader title="منابع فروش" />
            <div className="divide-y divide-line">
              {data.sales_lines.map((line) => (
                <div key={line.key} className="flex items-center justify-between py-4">
                  <div>
                    <div className="text-sm text-ink">{line.label}</div>
                    <div className="mt-1 text-xs text-faint">{line.connected ? line.note : "هنوز متصل نیست"}</div>
                  </div>
                  <div className="tabular text-sm">{line.connected ? formatToman(line.value) : "—"}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
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
    </div>
  );
}
