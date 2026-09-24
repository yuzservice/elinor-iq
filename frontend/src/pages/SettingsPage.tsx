import { useState } from "react";
import { Button, PageHeader, Panel, SectionHeader, ThemeSwitch } from "../components/ui";
import { ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { formatDate, formatDateTime, formatNumber } from "../lib/format";
import { systemService } from "../services/system";

export function SettingsPage() {
  const { user } = useAuth();
  const { data, loading, error, setData } = useApi(() => systemService.status(), []);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  async function syncNow() {
    setSyncing(true);
    setMessage("");
    try {
      await systemService.syncNow();
      setMessage("همگام‌سازی آغاز شد. این کار ممکن است چند دقیقه طول بکشد.");
      const next = await systemService.status();
      setData(next);
    } catch {
      setMessage("دریافت اطلاعات با خطا مواجه شد.");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <Skeleton className="h-96" />;
  if (error || !data) return <ErrorState />;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="تنظیمات" description="حساب داخلی، ظاهر، اتصال API و وضعیت همگام‌سازی." />

      <Panel>
        <SectionHeader title="ظاهر" />
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm">زمینه رنگی</div>
            <div className="mt-1 text-xs text-faint">روشن، تیره یا پیروی از سیستم</div>
          </div>
          <ThemeSwitch />
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="حساب کاربری" />
        <Field label="نام کاربری" value={user?.username || "—"} />
        <Field label="نقش" value="مدیر" />
      </Panel>

      <Panel>
        <SectionHeader title="اتصال API الینور" />
        <Field label="وضعیت" value={data.api.configured ? "پیکربندی شده" : "تنظیم نشده"} />
        <Field label="آدرس پایه" value={data.api.base_url || "—"} ltr />
        <Field label="نام کاربری API" value={data.api.username || "—"} ltr />
        <p className="mt-3 text-xs text-faint">رمز عبور و توکن API هرگز در این صفحه نمایش داده نمی‌شود.</p>
      </Panel>

      <Panel>
        <SectionHeader title="همگام‌سازی" />
        <Field label="آخرین همگام‌سازی موفق" value={formatDateTime(data.sync.last_success_at)} />
        <Field
          label="بازه همگام‌سازی"
          value={
            data.sync.window_start
              ? `${formatDate(data.sync.window_start)} تا ${formatDate(data.sync.window_end)}`
              : "—"
          }
        />
        <div className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <Count label="سفارش" value={data.counts.orders} />
          <Count label="همه مشتریان" value={data.counts.customers} />
          <Count label="مشتریان خریدار" value={data.counts.purchasing_customers} />
          <Count label="آیتم" value={data.counts.items} />
          <Count label="کالا" value={data.counts.products} />
          <Count label="تنوع" value={data.counts.variants} />
        </div>
        {data.sync.error ? <p className="mt-4 text-sm text-rose">آخرین خطا در لاگ سرور ثبت شده است.</p> : null}
        <div className="mt-6 flex items-center gap-4">
          <Button onClick={syncNow} disabled={syncing || data.sync.running}>
            {data.sync.running || syncing ? "در حال همگام‌سازی..." : "همگام‌سازی اکنون"}
          </Button>
          {message ? <span className="text-sm text-muted">{message}</span> : null}
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="پشتیبان‌گیری" />
        <p className="text-sm leading-7 text-muted">{data.backup.note}</p>
      </Panel>

      <Panel>
        <SectionHeader title="سیستم" />
        <Field label="محصول" value="ELINOR IQ v2" />
        <Field label="پایگاه داده" value="PostgreSQL 16" />
      </Panel>
    </div>
  );
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className={ltr ? "ltr-iso" : ""}>{value}</span>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-faint">{label}</div>
      <div className="mt-1 tabular text-lg">{formatNumber(value)}</div>
    </div>
  );
}
