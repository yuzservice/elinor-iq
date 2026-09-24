import { Panel } from "../../components/ui";
import { ErrorState, Skeleton } from "../../components/Table";
import { useApi } from "../../hooks/useApi";
import { formatNumber } from "../../lib/format";
import { customersService } from "../../services/customers";

export function CustomerReportsPanel() {
  const { data, loading, error } = useApi(() => customersService.reports(), []);
  if (loading) return <Skeleton className="h-56" />;
  if (error || !data) return <ErrorState />;

  return (
    <div className="space-y-6">
      <Panel>
        <div className="grid gap-4 sm:grid-cols-3">
          <Population label="همه مشتریان" value={data.populations.all_customers} hint="ثبت‌شده در الینور" />
          <Population label="مشتریان خریدار" value={data.populations.purchasing_customers} hint="دارای سفارش در داده فعلی" />
          <Population
            label="ثبت‌شده بدون خرید"
            value={data.populations.registered_without_orders}
            hint="وجود مشتری به‌معنای خرید نیست"
          />
        </div>
      </Panel>
    </div>
  );
}

function Population({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl bg-hover px-4 py-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-2 tabular text-2xl font-medium">{formatNumber(value)}</div>
      <div className="mt-1 text-[11px] text-faint">{hint}</div>
    </div>
  );
}
